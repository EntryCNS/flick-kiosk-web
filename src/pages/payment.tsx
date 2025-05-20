import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { API_URL } from "@/constants/api";
import api from "@/libs/api";
import { useCartStore } from "@/stores/cart";
import { usePaymentStore } from "@/stores/payment";
import { useMutation } from "@tanstack/react-query";

type PaymentMethod = "QR_CODE" | "STUDENT_ID";
type WebSocketStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "FAILED";

interface NotificationType {
  type: "success" | "error" | "info";
  message: string;
  submessage?: string;
}

interface ErrorResponse {
  code?: string;
  message?: string;
}

interface CartItemType {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: "주문을 찾을 수 없습니다",
  ORDER_NOT_PENDING: "이미 처리된 주문입니다",
  USER_NOT_FOUND: "등록되지 않은 학번입니다",
  BOOTH_NOT_FOUND: "부스 정보를 찾을 수 없습니다",
};

const NOTIFICATION_DURATION = 3000;
const WS_RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 3;

export default function PaymentScreen(): React.ReactElement {
  const { items: cart, getTotalAmount, clearCart } = useCartStore();
  const {
    orderId,
    requestId,
    requestCode,
    timer,
    isActive,
    decrementTimer,
    cancelPayment,
    status,
    setStatus,
    requestMethod,
    setPaymentRequest,
    resetPaymentRequest,
  } = usePaymentStore();

  const [selectedMethod, setSelectedMethod] =
    useState<PaymentMethod>("QR_CODE");
  const [studentId, setStudentId] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationType | null>(
    null
  );
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>("DISCONNECTED");
  const [timerPulse, setTimerPulse] = useState(false);

  const isMounted = useRef<boolean>(true);
  const wsReconnectAttemptsRef = useRef<number>(0);
  const notificationRef = useRef<HTMLDivElement>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const notificationTimeoutRef = useRef<number | null>(null);
  const wsReconnectTimeoutRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      if (orderId) {
        return await api.post(`/orders/${orderId}/cancel`);
      }
      return null;
    },
    onError: (error) => {
      if (!isMounted.current) return;

      let message = "주문 취소 중 오류가 발생했습니다";

      if (isAxiosError(error) && error.response?.data) {
        try {
          const errorData = error.response.data as ErrorResponse;
          if (errorData.code && ERROR_MESSAGES[errorData.code]) {
            message = ERROR_MESSAGES[errorData.code];
          }
        } catch (e) {
          console.error("Error parsing response:", e);
        }
      }

      showNotification("error", message);
    },
    onSettled: () => {
      if (!isMounted.current) return;

      cancelPayment();
      clearCart();
      navigate("/products");
    },
  });

  const qrPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("주문 정보가 없습니다");
      const response = await api.post("/payments/qr", { orderId });
      return response.data;
    },
    onSuccess: (data) => {
      if (!isMounted.current) return;

      setPaymentRequest(
        data.id,
        data.token || "",
        "PENDING",
        "QR_CODE",
        data.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString()
      );
    },
    onError: (error) => {
      if (!isMounted.current) return;

      let errorMsg = "결제 요청을 생성할 수 없습니다";
      let code: string | null = null;

      if (isAxiosError(error)) {
        if (error.response?.data) {
          try {
            const errorData = error.response.data as ErrorResponse;
            if (errorData.code) {
              code = errorData.code;
              if (ERROR_MESSAGES[code]) {
                errorMsg = ERROR_MESSAGES[code];
              }
            }
          } catch (e) {
            console.error("Error parsing response:", e);
          }
        } else if (error.code === "ECONNABORTED") {
          errorMsg = "서버 응답 시간 초과";
        }
      }

      setErrorCode(code);
      setErrorMessage(errorMsg);
      showNotification("error", errorMsg);
    },
  });

  const studentIdPaymentMutation = useMutation({
    mutationFn: async (studentIdValue: string) => {
      if (!orderId) throw new Error("주문 정보가 없습니다");
      const response = await api.post("/payments/student-id", {
        orderId,
        studentId: studentIdValue.trim(),
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (!isMounted.current) return;

      setPaymentRequest(
        data.id,
        data.token || studentId,
        "PENDING",
        "STUDENT_ID",
        data.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString()
      );

      showNotification("success", "학번 결제 요청 완료");
    },
    onError: (error) => {
      if (!isMounted.current) return;

      let errorMsg = "결제 요청에 실패했습니다";
      let code: string | null = null;

      if (isAxiosError(error)) {
        if (error.response?.data) {
          try {
            const errorData = error.response.data as ErrorResponse;
            if (errorData.code) {
              code = errorData.code;
              if (ERROR_MESSAGES[code]) {
                errorMsg = ERROR_MESSAGES[code];
              }
            }
          } catch (e) {
            console.error("Error parsing response:", e);
          }
        } else if (error.code === "ECONNABORTED") {
          errorMsg = "서버 응답 시간 초과";
        }
      }

      setErrorCode(code);
      setErrorMessage(errorMsg);
      showNotification("error", errorMsg);
    },
  });

  const showNotification = useCallback(
    (
      type: "success" | "error" | "info",
      message: string,
      submessage?: string
    ) => {
      if (!isMounted.current) return;

      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }

      setNotification({ type, message, submessage });

      notificationTimeoutRef.current = window.setTimeout(() => {
        if (isMounted.current) {
          setNotification(null);
        }
      }, NOTIFICATION_DURATION);
    },
    []
  );

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;

      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }

      if (webSocketRef.current) {
        try {
          webSocketRef.current.close();
          webSocketRef.current = null;
        } catch (e) {
          console.error("Error closing WebSocket:", e);
        }
      }
    };
  }, []);

  useEffect(() => {
    const shouldAnimate = timer <= 60;

    if (shouldAnimate) {
      const interval = setInterval(() => {
        setTimerPulse((prev) => !prev);
      }, 500);

      return () => clearInterval(interval);
    }

    return () => setTimerPulse(false);
  }, [timer]);

  const handleCancel = useCallback(() => {
    if (isMounted.current) {
      cancelOrderMutation.mutate();
    }
  }, [cancelOrderMutation]);

  useEffect(() => {
    if (isActive && timer > 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      timerIntervalRef.current = window.setInterval(() => {
        if (isMounted.current) {
          decrementTimer();
        }
      }, 1000);
    } else if (timer <= 0 && isActive && isMounted.current) {
      handleCancel();
    }

    if (status === "COMPLETED" && isMounted.current) {
      navigate("/payment-complete");
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isActive, timer, status, decrementTimer, handleCancel, navigate]);

  const connectWebSocket = useCallback(() => {
    if (!requestId || !isMounted.current) return;
    if (wsStatus === "CONNECTING" || wsStatus === "CONNECTED") return;

    setWsStatus("CONNECTING");

    const wsUrl =
      API_URL.replace(/^http(s?):\/\//, (_, s) => (s ? "wss://" : "ws://")) +
      `/ws/payment-requests/${requestId}`;

    try {
      if (
        webSocketRef.current &&
        webSocketRef.current.readyState !== WebSocket.CLOSED
      ) {
        webSocketRef.current.close();
      }

      const ws = new WebSocket(wsUrl);
      webSocketRef.current = ws;

      ws.onopen = () => {
        if (isMounted.current) {
          setWsStatus("CONNECTED");
          wsReconnectAttemptsRef.current = 0;
        }
      };

      ws.onmessage = (event) => {
        if (!isMounted.current) return;

        try {
          const data = JSON.parse(event.data);

          if (data.status === "COMPLETED") {
            setStatus("COMPLETED");
          } else if (data.status === "FAILED") {
            setStatus("FAILED");
            showNotification(
              "error",
              "결제 실패",
              data.message || "결제가 실패했습니다."
            );
          } else if (data.status === "EXPIRED") {
            setStatus("EXPIRED");
            showNotification("error", "결제 시간이 초과되었습니다.");
            handleCancel();
          }
        } catch (error) {
          console.error("WebSocket message processing error:", error);
          if (isMounted.current) {
            setWsStatus("FAILED");
          }
        }
      };

      ws.onerror = () => {
        if (isMounted.current) {
          setWsStatus("FAILED");
        }
      };

      ws.onclose = (event) => {
        if (!isMounted.current) return;

        if (!event.wasClean) {
          setWsStatus("DISCONNECTED");

          if (
            wsReconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS &&
            requestId &&
            isMounted.current
          ) {
            const delay = Math.min(
              WS_RECONNECT_DELAY * (wsReconnectAttemptsRef.current + 1),
              10000
            );

            if (wsReconnectTimeoutRef.current) {
              clearTimeout(wsReconnectTimeoutRef.current);
              wsReconnectTimeoutRef.current = null;
            }

            wsReconnectTimeoutRef.current = window.setTimeout(() => {
              if (isMounted.current) {
                wsReconnectAttemptsRef.current += 1;
                connectWebSocket();
              }
            }, delay);
          } else {
            setWsStatus("FAILED");
          }
        }
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      if (isMounted.current) {
        setWsStatus("FAILED");
      }
    }
  }, [requestId, wsStatus, showNotification, handleCancel, setStatus]);

  useEffect(() => {
    if (requestId && wsStatus !== "CONNECTED" && isMounted.current) {
      connectWebSocket();
    } else if (!requestId) {
      if (isMounted.current) {
        setWsStatus("DISCONNECTED");
      }

      if (webSocketRef.current) {
        try {
          webSocketRef.current.close();
          webSocketRef.current = null;
        } catch (e) {
          console.error("Error closing WebSocket:", e);
        }
      }

      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
    }
  }, [requestId, connectWebSocket, wsStatus]);

  const handleReconnectWebSocket = useCallback(() => {
    if (isMounted.current) {
      wsReconnectAttemptsRef.current = 0;
      connectWebSocket();
    }
  }, [connectWebSocket]);

  const createQrPaymentRequest = useCallback(() => {
    if (isMounted.current) {
      qrPaymentMutation.mutate();
    }
  }, [qrPaymentMutation]);

  useEffect(() => {
    if (
      selectedMethod === "QR_CODE" &&
      orderId &&
      !requestCode &&
      !qrPaymentMutation.isPending &&
      isMounted.current
    ) {
      createQrPaymentRequest();
    }
  }, [
    selectedMethod,
    orderId,
    requestCode,
    createQrPaymentRequest,
    qrPaymentMutation.isPending,
  ]);

  const handleMethodChange = useCallback(
    (method: PaymentMethod) => {
      if (
        selectedMethod !== method &&
        !qrPaymentMutation.isPending &&
        !studentIdPaymentMutation.isPending &&
        isMounted.current
      ) {
        setSelectedMethod(method);
        setErrorMessage(null);
        setErrorCode(null);

        resetPaymentRequest();

        if (method === "STUDENT_ID") {
          setStudentId("");
        }
      }
    },
    [
      selectedMethod,
      resetPaymentRequest,
      qrPaymentMutation.isPending,
      studentIdPaymentMutation.isPending,
    ]
  );

  const validateStudentId = useCallback((id: string): boolean => {
    if (id.length !== 4) return false;

    const grade = parseInt(id[0], 10);
    const room = parseInt(id[1], 10);
    const number = parseInt(id.substring(2), 10);

    return (
      grade >= 1 &&
      grade <= 9 &&
      room >= 1 &&
      room <= 9 &&
      number >= 1 &&
      number <= 99
    );
  }, []);

  const handleStudentIdSubmit = useCallback(() => {
    if (!isMounted.current) return;

    if (!validateStudentId(studentId)) {
      showNotification("info", "올바른 학번 형식이 아닙니다");
      return;
    }

    studentIdPaymentMutation.mutate(studentId);
  }, [
    studentId,
    validateStudentId,
    showNotification,
    studentIdPaymentMutation,
  ]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }, []);

  const handleRetry = useCallback(() => {
    if (!isMounted.current) return;

    resetPaymentRequest();
    setErrorMessage(null);
    setErrorCode(null);

    if (selectedMethod === "STUDENT_ID") {
      setStudentId("");
    }
  }, [selectedMethod, resetPaymentRequest]);

  const renderErrorAction = useCallback(() => {
    if (!errorCode) return null;

    switch (errorCode) {
      case "ORDER_NOT_PENDING":
      case "ORDER_NOT_FOUND":
        return (
          <motion.button
            className="bg-[#6366F1] text-[#FFFFFF] py-3 px-5 rounded-xl text-sm font-semibold mt-3.5"
            onClick={() => {
              if (isMounted.current) {
                navigate("/products");
              }
            }}
            whileTap={{ scale: 0.95 }}
          >
            상품 목록으로 돌아가기
          </motion.button>
        );
      default:
        return (
          <motion.button
            className="bg-[#6366F1] text-[#FFFFFF] py-3 px-5 rounded-xl text-sm font-semibold mt-3.5 min-w-[150px]"
            onClick={handleRetry}
            whileTap={{ scale: 0.95 }}
          >
            다시 시도
          </motion.button>
        );
    }
  }, [errorCode, handleRetry, navigate]);

  const handleKeypadPress = useCallback(
    (value: string) => {
      if (!isMounted.current) return;

      if (value === "delete") {
        setStudentId((prev) => prev.slice(0, -1));
      } else if (value === "clear") {
        setStudentId("");
      } else if (studentId.length < 4) {
        setStudentId((prev) => prev + value);
      }
    },
    [studentId]
  );

  const keypadButtons = useMemo(() => {
    return [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["clear", "0", "delete"],
    ];
  }, []);

  const renderKeypadButton = useCallback(
    (key: string, index: number) => (
      <motion.button
        key={`key-${key}-${index}`}
        className={`w-14 h-14 flex items-center justify-center rounded-lg ${
          key === "delete" || key === "clear" ? "bg-[#E2E8F0]" : "bg-[#F8FAFC]"
        }`}
        onClick={() => handleKeypadPress(key)}
        whileTap={{ scale: 0.95 }}
      >
        {key === "delete" ? (
          <span className="text-[#334155] text-xl">←</span>
        ) : key === "clear" ? (
          <span className="text-[#334155] text-xl">C</span>
        ) : (
          <span className="text-[#1E293B] text-xl">{key}</span>
        )}
      </motion.button>
    ),
    [handleKeypadPress]
  );

  const renderKeypad = useCallback(() => {
    return (
      <div className="mb-5">
        {keypadButtons.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="flex justify-center gap-3.5 mb-2.5"
          >
            {row.map((key, keyIndex) => renderKeypadButton(key, keyIndex))}
          </div>
        ))}
      </div>
    );
  }, [keypadButtons, renderKeypadButton]);

  const getWsStatusColor = useCallback(() => {
    switch (wsStatus) {
      case "CONNECTED":
        return "#22C55E"; // success500
      case "CONNECTING":
        return "#F59E0B"; // warning500
      case "DISCONNECTED":
      case "FAILED":
        return "#EF4444"; // danger500
      default:
        return "#64748B"; // gray500
    }
  }, [wsStatus]);

  const isSubmitting =
    qrPaymentMutation.isPending ||
    studentIdPaymentMutation.isPending ||
    cancelOrderMutation.isPending;

  const renderQRPaymentContent = useCallback(() => {
    if (qrPaymentMutation.isPending || (!requestCode && !errorMessage)) {
      return (
        <div className="flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#6366F1] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm text-[#334155]">QR 코드 생성 중...</p>
        </div>
      );
    }

    if (errorMessage) {
      return (
        <motion.div
          className="flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <svg
            className="w-11 h-11 text-[#EF4444] mb-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-[#EF4444] text-base font-medium text-center mx-4 mb-3.5">
            {errorMessage}
          </p>
          {renderErrorAction()}
        </motion.div>
      );
    }

    return (
      <motion.div
        className="flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="p-4 bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl mb-5"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <QRCodeSVG
            value={requestCode || ""}
            size={200}
            bgColor="#FFFFFF"
            fgColor="#000000"
            level="H"
          />
        </motion.div>
        <p className="text-lg font-semibold text-[#1E293B] mb-3 text-center">
          QR 코드를 스캔하여 결제해 주세요
        </p>
        <p className="text-sm text-[#475569] text-center mb-5">
          결제가 완료될 때까지 기다려주세요
        </p>
      </motion.div>
    );
  }, [
    qrPaymentMutation.isPending,
    requestCode,
    errorMessage,
    renderErrorAction,
  ]);

  const renderStudentIdPaymentContent = useCallback(() => {
    if (requestMethod === "STUDENT_ID" && requestCode) {
      return (
        <motion.div
          className="flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <svg
            className="w-14 h-14 text-[#22C55E] mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-semibold text-[#1E293B] mb-2 text-center">
            학번 결제가 요청되었습니다
          </p>
          <p className="text-sm text-[#475569] mb-5 text-center">
            결제가 완료될 때까지 기다려주세요
          </p>

          <div className="mt-4 mb-6">
            <div className="flex gap-3">
              {studentId.split("").map((digit, index) => (
                <motion.div
                  key={index}
                  className="w-11 h-13 flex items-center justify-center bg-[#EEF2FF] rounded-lg"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2, delay: index * 0.1 }}
                >
                  <span className="text-xl font-bold text-[#4338CA]">
                    {digit}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.button
            className="bg-[#6366F1] text-[#FFFFFF] py-3 px-5 rounded-xl text-sm font-semibold min-w-[150px] flex items-center justify-center"
            onClick={handleRetry}
            disabled={isSubmitting}
            whileTap={{ scale: 0.95 }}
            whileHover={{ backgroundColor: "#4F46E5" }}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-[#FFFFFF] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span>다시 요청하기</span>
            )}
          </motion.button>
        </motion.div>
      );
    }

    if (errorMessage) {
      return (
        <motion.div
          className="flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <svg
            className="w-11 h-11 text-[#EF4444] mb-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-[#EF4444] text-base font-medium text-center mx-4 mb-3.5">
            {errorMessage}
          </p>
          {renderErrorAction()}
        </motion.div>
      );
    }

    return (
      <motion.div
        className="flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <p className="text-lg font-semibold text-[#1E293B] mb-4.5 text-center">
          4자리 학번을 입력해주세요
        </p>

        <div className="flex gap-3.5 my-4.5">
          {[0, 1, 2, 3].map((index) => (
            <motion.div
              key={`digit-${index}`}
              className={`w-11 h-14 flex items-center justify-center border-b-2 ${
                index < studentId.length
                  ? "border-[#6366F1]"
                  : "border-[#CBD5E1]"
              }`}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              {index < studentId.length && (
                <span className="text-2xl font-bold text-[#1E293B]">
                  {studentId[index]}
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {renderKeypad()}

        <motion.button
          className={`w-56 h-12 rounded-xl text-[#FFFFFF] text-base font-semibold mt-2.5 ${
            !validateStudentId(studentId) || studentIdPaymentMutation.isPending
              ? "bg-[#CBD5E1] opacity-80"
              : "bg-[#6366F1]"
          }`}
          onClick={handleStudentIdSubmit}
          disabled={
            !validateStudentId(studentId) || studentIdPaymentMutation.isPending
          }
          whileTap={
            !validateStudentId(studentId) || studentIdPaymentMutation.isPending
              ? {}
              : { scale: 0.95 }
          }
          whileHover={
            !validateStudentId(studentId) || studentIdPaymentMutation.isPending
              ? {}
              : { backgroundColor: "#4F46E5" }
          }
        >
          {studentIdPaymentMutation.isPending ? (
            <div className="w-5 h-5 border-2 border-[#FFFFFF] border-t-transparent rounded-full animate-spin mx-auto"></div>
          ) : (
            <span>결제 요청하기</span>
          )}
        </motion.button>
      </motion.div>
    );
  }, [
    requestMethod,
    requestCode,
    studentId,
    errorMessage,
    isSubmitting,
    validateStudentId,
    studentIdPaymentMutation.isPending,
    handleRetry,
    handleStudentIdSubmit,
    renderErrorAction,
    renderKeypad,
  ]);

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC]">
      {notification && (
        <motion.div
          ref={notificationRef}
          className={`fixed top-4 left-1/2 -ml-40 w-80 bg-[#FFFFFF] rounded-lg flex items-center p-3.5 z-50 shadow-md ${
            notification.type === "success"
              ? "border-l-4 border-[#22C55E]"
              : notification.type === "error"
              ? "border-l-4 border-[#EF4444]"
              : "border-l-4 border-[#6366F1]"
          }`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {notification.type === "success" && (
            <svg
              className="w-6 h-6 text-[#22C55E]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {notification.type === "error" && (
            <svg
              className="w-6 h-6 text-[#EF4444]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          {notification.type === "info" && (
            <svg
              className="w-6 h-6 text-[#6366F1]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
          <div className="ml-2.5 flex-1">
            <p className="text-sm font-semibold text-[#1E293B]">
              {notification.message}
            </p>
            {notification.submessage && (
              <p className="text-xs text-[#475569] mt-0.5">
                {notification.submessage}
              </p>
            )}
          </div>
          <motion.button
            className="w-6 h-6 flex items-center justify-center"
            onClick={() => setNotification(null)}
            whileTap={{ scale: 0.9 }}
          >
            <span className="text-xl text-[#475569]">&times;</span>
          </motion.button>
        </motion.div>
      )}

      <header className="flex items-center justify-between bg-[#FFFFFF] px-5 py-3.5 border-b border-[#E2E8F0] h-15">
        <motion.button
          className="flex items-center px-2.5 py-1.5 rounded-lg"
          onClick={() => {
            if (isMounted.current && !isSubmitting) {
              navigate("/products");
            }
          }}
          disabled={isSubmitting}
          whileTap={{ scale: 0.95 }}
          whileHover={{ backgroundColor: "#F1F5F9" }}
        >
          <svg
            className="w-6 h-6 text-[#1E293B]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="ml-1 text-base font-medium text-[#1E293B]">
            돌아가기
          </span>
        </motion.button>

        <h1 className="text-xl font-bold text-[#1E293B]">
          <span className="text-[#6366F1]">Flick</span> Place
        </h1>

        <div className="flex items-center gap-3">
          <motion.button
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: getWsStatusColor() }}
            onClick={
              wsStatus === "FAILED" ? handleReconnectWebSocket : undefined
            }
            whileTap={wsStatus === "FAILED" ? { scale: 0.9 } : {}}
          />
          <motion.div
            className={`flex items-center px-3 py-1.5 bg-[#F1F5F9] rounded-lg`}
            animate={{
              opacity: timerPulse && timer <= 60 ? 0.6 : 1,
            }}
            transition={{ duration: 0.3 }}
          >
            <svg
              className={`w-5 h-5 ${
                timer <= 60 ? "text-[#EF4444]" : "text-[#334155]"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span
              className={`ml-1.5 text-sm font-bold ${
                timer <= 60 ? "text-[#EF4444]" : "text-[#1E293B]"
              }`}
            >
              {formatTime(timer)}
            </span>
          </motion.div>
        </div>
      </header>

      <div className="flex flex-1 p-5 gap-5">
        <motion.div
          className="flex-grow flex flex-col bg-[#FFFFFF] rounded-xl overflow-hidden border border-[#E2E8F0]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex border-b border-[#E2E8F0] h-13">
            <motion.button
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 ${
                selectedMethod === "QR_CODE"
                  ? "bg-[#EEF2FF] border-b-2 border-[#6366F1]"
                  : ""
              }`}
              onClick={() => handleMethodChange("QR_CODE")}
              disabled={isSubmitting}
              whileHover={!isSubmitting ? { backgroundColor: "#F8FAFC" } : {}}
              whileTap={!isSubmitting ? { scale: 0.98 } : {}}
            >
              <svg
                className={`w-5 h-5 ${
                  selectedMethod === "QR_CODE"
                    ? "text-[#6366F1]"
                    : "text-[#475569]"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1v-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1z"
                />
              </svg>
              <span
                className={`text-sm font-medium ${
                  selectedMethod === "QR_CODE"
                    ? "text-[#6366F1] font-semibold"
                    : "text-[#475569]"
                }`}
              >
                QR 결제
              </span>
            </motion.button>

            <motion.button
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 ${
                selectedMethod === "STUDENT_ID"
                  ? "bg-[#EEF2FF] border-b-2 border-[#6366F1]"
                  : ""
              }`}
              onClick={() => handleMethodChange("STUDENT_ID")}
              disabled={isSubmitting}
              whileHover={!isSubmitting ? { backgroundColor: "#F8FAFC" } : {}}
              whileTap={!isSubmitting ? { scale: 0.98 } : {}}
            >
              <svg
                className={`w-5 h-5 ${
                  selectedMethod === "STUDENT_ID"
                    ? "text-[#6366F1]"
                    : "text-[#475569]"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span
                className={`text-sm font-medium ${
                  selectedMethod === "STUDENT_ID"
                    ? "text-[#6366F1] font-semibold"
                    : "text-[#475569]"
                }`}
              >
                학번 결제
              </span>
            </motion.button>
          </div>

          <div className="flex-1 p-5 flex items-center justify-center">
            <div className="w-full max-w-80">
              {selectedMethod === "QR_CODE"
                ? renderQRPaymentContent()
                : renderStudentIdPaymentContent()}
            </div>
          </div>
        </motion.div>

        <motion.div
          className="w-1/3 min-w-72 flex flex-col bg-[#FFFFFF] rounded-xl border border-[#E2E8F0]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="py-3.5 px-5 border-b border-[#E2E8F0] h-13">
            <h2 className="text-base font-semibold text-[#1E293B]">
              주문 내역
            </h2>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="px-5 py-2">
              {cart.map((item: CartItemType) => (
                <motion.div
                  key={item.id}
                  className="flex justify-between py-3 border-b border-[#F1F5F9]"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="flex-1 text-sm font-medium text-[#1E293B] mr-2.5 truncate">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-3.5">
                    <span className="text-sm text-[#475569] min-w-7 text-right">
                      {item.quantity}개
                    </span>
                    <span className="text-sm font-semibold text-[#1E293B] min-w-19 text-right">
                      {(item.price * item.quantity).toLocaleString()}원
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="p-5 border-t border-[#E2E8F0]">
            <div className="flex justify-between items-center mb-4">
              <span className="text-base font-semibold text-[#1E293B]">
                총 결제 금액
              </span>
              <span className="text-xl font-bold text-[#6366F1]">
                {getTotalAmount().toLocaleString()}원
              </span>
            </div>

            <motion.button
              className="w-full h-12 bg-[#EF4444] rounded-xl text-[#FFFFFF] font-semibold flex items-center justify-center"
              onClick={handleCancel}
              disabled={isSubmitting}
              whileHover={!isSubmitting ? { backgroundColor: "#e53e3e" } : {}}
              whileTap={!isSubmitting ? { scale: 0.98 } : {}}
            >
              {cancelOrderMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-[#FFFFFF] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>결제 취소</span>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
