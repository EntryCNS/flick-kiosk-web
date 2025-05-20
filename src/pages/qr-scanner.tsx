import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { COLORS } from "@/constants/colors";
import { API_URL } from "@/constants/api";
import axios from "axios";
import { useAuthStore } from "@/stores/auth";
import { useMutation } from "@tanstack/react-query";
import jsQR from "jsqr";

interface QRRegistrationResponse {
  accessToken: string;
}

export default function QrScannerPage(): React.ReactElement {
  const { signIn } = useAuthStore();
  const navigate = useNavigate();
  const [permission, setPermission] = useState<
    "granted" | "denied" | "pending"
  >("pending");
  const [isStreaming, setIsStreaming] = useState(false);
  const [scanActive, setScanActive] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isMounted = useRef<boolean>(true);
  const canScan = useRef<boolean>(true);
  const resetTimerRef = useRef<number | null>(null);

  const registerMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await axios.post<QRRegistrationResponse>(
        `${API_URL}/kiosks/register`,
        { registrationToken: token },
        { timeout: 10000 }
      );
      return response.data;
    },
    onSuccess: async (data) => {
      if (!isMounted.current) return;

      if (data?.accessToken) {
        await signIn(data.accessToken);
        if (isMounted.current) {
          navigate("/products");
        }
      } else {
        resetScanState();
      }
    },
    onError: (error) => {
      console.error("Registration error:", error);
      if (isMounted.current) {
        resetScanState();
      }
    },
  });

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsStreaming(false);
    setScanActive(true);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermission("denied");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsStreaming(true);
        setPermission("granted");
        scanQRCode();
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      setPermission("denied");
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      await startCamera();
    } catch (error) {
      console.error("Error requesting permission:", error);
      setPermission("denied");
    }
  }, [startCamera]);

  useEffect(() => {
    isMounted.current = true;
    requestPermission();

    return () => {
      isMounted.current = false;
      stopCamera();

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }

      if (registerMutation.isPending) {
        registerMutation.reset();
      }
    };
  }, [stopCamera, requestPermission, registerMutation]);

  const resetScanState = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    resetTimerRef.current = window.setTimeout(() => {
      if (isMounted.current) {
        canScan.current = true;
        setScanActive(true);
      }
    }, 1000);
  }, []);

  const scanQRCode = useCallback(() => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !isMounted.current ||
      !isStreaming ||
      !scanActive
    ) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) return;

    // 비디오 레디 상태 확인
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationFrameRef.current = requestAnimationFrame(scanQRCode);
      return;
    }

    // Canvas 크기를 비디오 크기에 맞춤
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 비디오에서 프레임 캡처
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // QR 코드 스캔
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    // QR 코드가 발견되고 스캔 가능 상태일 때
    if (code && canScan.current && !registerMutation.isPending) {
      canScan.current = false;
      setScanActive(false);

      if (code.data?.trim()) {
        registerMutation.mutate(code.data.trim());
      } else {
        resetScanState();
      }
    }

    // 계속 스캔
    animationFrameRef.current = requestAnimationFrame(scanQRCode);
  }, [isStreaming, registerMutation, resetScanState, scanActive]);

  // 비디오 스트림이 준비되면 스캔 시작
  useEffect(() => {
    if (isStreaming && videoRef.current && videoRef.current.readyState >= 2) {
      scanQRCode();
    }
  }, [isStreaming, scanQRCode]);

  const goBack = useCallback(() => {
    if (registerMutation.isPending) return;
    stopCamera();
    navigate("/login");
  }, [registerMutation.isPending, stopCamera, navigate]);

  if (permission === "pending") {
    return (
      <div className="flex flex-col h-screen bg-white">
        <Header onBack={goBack} />
        <div className="flex-1 flex items-center justify-center">
          <motion.div
            className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="mt-4 text-base font-medium text-gray-600">
            카메라 권한을 확인하는 중입니다
          </p>
        </div>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex flex-col h-screen bg-white">
        <Header onBack={goBack} />
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <motion.h2
            className="text-2xl font-bold text-gray-900 mb-3 text-center"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            카메라 권한이 필요합니다
          </motion.h2>
          <motion.p
            className="text-base font-medium text-gray-600 text-center mb-8"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            QR 코드를 스캔하려면 카메라 접근 권한이 필요합니다
          </motion.p>
          <motion.button
            className="bg-primary-500 text-white py-3.5 px-5 rounded-lg min-w-52 text-base font-semibold"
            onClick={requestPermission}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            whileHover={{ backgroundColor: COLORS.primary600 }}
            whileTap={{ scale: 0.95 }}
          >
            다시 시도
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute inset-0 flex flex-col">
          <HeaderLight onBack={goBack} disabled={registerMutation.isPending} />

          <div className="flex-1 flex items-center justify-center">
            <motion.div
              className="relative w-72 h-72 rounded-2xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Corner Borders */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl"></div>

              {scanActive && (
                <motion.div
                  className="absolute top-0 left-0 w-full h-0.5 bg-white opacity-80"
                  animate={{
                    top: ["0%", "100%", "0%"],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              )}
            </motion.div>

            <motion.p
              className="absolute mt-80 text-lg font-medium text-white text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              QR 코드를 프레임 안에 위치시켜주세요
            </motion.p>

            {registerMutation.isPending && (
              <motion.div
                className="absolute bg-black bg-opacity-70 py-5 px-6 rounded-lg min-w-40 flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className="w-8 h-8 border-4 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
                <p className="mt-3 text-base font-medium text-white">
                  처리 중...
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface HeaderProps {
  onBack: () => void;
}

function Header({ onBack }: HeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-4 py-3 h-14">
      <motion.button
        className="w-10 h-10 flex items-center justify-center rounded-full"
        onClick={onBack}
        whileHover={{ backgroundColor: COLORS.gray100 }}
        whileTap={{ scale: 0.9 }}
      >
        <svg
          className="w-6 h-6 text-gray-900"
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
      </motion.button>
      <h1 className="text-lg font-semibold text-gray-900">QR 코드 스캔</h1>
      <div className="w-10"></div>
    </div>
  );
}

interface HeaderLightProps {
  onBack: () => void;
  disabled?: boolean;
}

function HeaderLight({
  onBack,
  disabled = false,
}: HeaderLightProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-4 py-3 h-14 z-10">
      <motion.button
        className="w-10 h-10 flex items-center justify-center rounded-full"
        onClick={onBack}
        disabled={disabled}
        whileHover={
          !disabled ? { backgroundColor: "rgba(255, 255, 255, 0.2)" } : {}
        }
        whileTap={!disabled ? { scale: 0.9 } : {}}
      >
        <svg
          className="w-6 h-6 text-white"
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
      </motion.button>
      <h1 className="text-lg font-semibold text-white">QR 코드 스캔</h1>
      <div className="w-10"></div>
    </div>
  );
}
