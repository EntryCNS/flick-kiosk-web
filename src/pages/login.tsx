import { API_URL } from "@/constants/api";
import { useAuthStore } from "@/stores/auth";
import axios, { isAxiosError } from "axios";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useCartStore } from "@/stores/cart";
import { usePaymentStore } from "@/stores/payment";
import { motion } from "framer-motion";

interface ErrorResponse {
  code: string;
  status: number;
  message: string;
}

const ERROR_CODES: Record<string, string> = {
  BOOTH_NOT_FOUND: "등록된 부스가 아닙니다",
  BOOTH_NOT_APPROVED: "승인된 부스가 아닙니다",
  BOOTH_REJECTED: "거절된 부스입니다",
  BOOTH_INACTIVE: "금지된 부스입니다",
  BOOTH_PASSWORD_NOT_MATCH: "비밀번호가 맞지 않습니다",
};

const loginSchema = z.object({
  username: z.string().min(1, "아이디를 입력해주세요"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen(): React.ReactElement {
  const { signIn } = useAuthStore();
  const { clearCart } = useCartStore();
  const { resetPayment } = usePaymentStore();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();

  const isMounted = useRef<boolean>(true);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors,
    watch,
    setFocus,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const formValues = watch();

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await axios.post(`${API_URL}/kiosks/login`, {
        username: data.username.trim(),
        password: data.password,
      });
      return response.data;
    },
    onSuccess: async (data: { accessToken?: string }) => {
      if (!isMounted.current) return;

      if (data?.accessToken) {
        await signIn(data.accessToken);
        clearCart();
        resetPayment();

        if (isMounted.current) {
          navigate("/products");
        }
      } else {
        if (isMounted.current) {
          setError("root", { message: "로그인에 실패했습니다" });
        }
      }
    },
    onError: (error: unknown) => {
      if (!isMounted.current) return;

      if (isAxiosError(error) && error.response?.data) {
        try {
          const errorData = error.response.data as ErrorResponse;

          if (errorData.code === "BOOTH_PASSWORD_NOT_MATCH") {
            setError("password", { message: ERROR_CODES[errorData.code] });
            setFocus("password");
          } else if (errorData.code && errorData.code in ERROR_CODES) {
            setError("root", { message: ERROR_CODES[errorData.code] });
          } else {
            setError("root", { message: "로그인에 실패했습니다" });
          }
        } catch (e) {
          console.error("Error parsing response:", e);
          setError("root", { message: "로그인에 실패했습니다" });
        }
      } else {
        setError("root", { message: "연결에 실패했습니다" });
      }
    },
  });

  const onSubmit = useCallback(
    (data: LoginFormData) => {
      if (!isMounted.current) return;
      loginMutation.mutate(data);
    },
    [loginMutation]
  );

  const goToQrScanner = useCallback(() => {
    if (!isMounted.current) return;
    if (loginMutation.isPending) return;

    clearErrors();
    navigate("/auth/qr");
  }, [loginMutation.isPending, clearErrors, navigate]);

  const handleFieldFocus = useCallback((fieldName: string) => {
    if (isMounted.current) {
      setFocusedField(fieldName);
    }
  }, []);

  const handleFieldBlur = useCallback(() => {
    if (isMounted.current) {
      setFocusedField(null);
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex items-center px-6 py-4 border-b border-gray-100 h-16">
        <img
          src="/assets/images/logo.png"
          alt="Logo"
          className="w-9 h-9 mr-3"
        />
        <h1 className="text-2xl font-bold text-gray-900">
          <span className="text-primary-500">Flick</span> Place
        </h1>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="w-full max-w-md px-6 py-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-7 text-center">
            키오스크 로그인
          </h2>

          {errors.root?.message && (
            <motion.div
              className="flex items-center bg-red-50 py-3.5 px-4 rounded-lg mb-6 border border-red-100"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <svg
                className="w-5 h-5 text-red-500 mr-2"
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
              <span className="flex-1 text-sm font-medium text-red-600">
                {errors.root.message}
              </span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mb-6">
            <div className="mb-5">
              <div className="flex justify-between items-center mb-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-gray-700"
                >
                  아이디
                </label>
                {errors.username?.message && (
                  <motion.span
                    className="text-sm font-medium text-red-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                  >
                    {errors.username.message}
                  </motion.span>
                )}
              </div>
              <input
                id="username"
                type="text"
                {...register("username")}
                ref={(e) => {
                  register("username").ref(e);
                  usernameRef.current = e;
                }}
                className={`w-full h-14 rounded-lg px-4 text-base text-gray-900 ${
                  focusedField === "username"
                    ? "border-2 border-primary-500 bg-white"
                    : "border border-gray-200 bg-gray-50"
                } ${errors.username ? "border-red-500" : ""}`}
                placeholder="아이디를 입력하세요"
                onFocus={() => handleFieldFocus("username")}
                onBlur={handleFieldBlur}
                onKeyDown={(e) =>
                  e.key === "Enter" && passwordRef.current?.focus()
                }
                autoCapitalize="none"
              />
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-gray-700"
                >
                  비밀번호
                </label>
                {errors.password?.message && (
                  <motion.span
                    className="text-sm font-medium text-red-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25 }}
                  >
                    {errors.password.message}
                  </motion.span>
                )}
              </div>
              <input
                id="password"
                type="password"
                {...register("password")}
                ref={(e) => {
                  register("password").ref(e);
                  passwordRef.current = e;
                }}
                className={`w-full h-14 rounded-lg px-4 text-base text-gray-900 ${
                  focusedField === "password"
                    ? "border-2 border-primary-500 bg-white"
                    : "border border-gray-200 bg-gray-50"
                } ${errors.password ? "border-red-500" : ""}`}
                placeholder="비밀번호를 입력하세요"
                onFocus={() => handleFieldFocus("password")}
                onBlur={handleFieldBlur}
                autoCapitalize="none"
              />
            </div>

            <motion.button
              type="submit"
              className={`w-full h-14 rounded-lg flex items-center justify-center ${
                !formValues.username ||
                !formValues.password ||
                loginMutation.isPending
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-primary-500 hover:bg-primary-600"
              }`}
              disabled={
                !formValues.username ||
                !formValues.password ||
                loginMutation.isPending
              }
              whileTap={
                !formValues.username ||
                !formValues.password ||
                loginMutation.isPending
                  ? {}
                  : { scale: 0.98 }
              }
            >
              {loginMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span className="text-white text-base font-semibold">
                  로그인
                </span>
              )}
            </motion.button>
          </form>

          <div className="flex items-center my-6">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="mx-4 text-sm text-gray-500">또는</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          <motion.button
            className={`w-full h-14 rounded-lg flex items-center justify-center border border-primary-500 ${
              loginMutation.isPending
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-primary-50"
            }`}
            onClick={goToQrScanner}
            disabled={loginMutation.isPending}
            whileTap={loginMutation.isPending ? {} : { scale: 0.98 }}
          >
            <svg
              className="w-5 h-5 text-primary-500 mr-2.5"
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
            <span className="text-primary-500 text-base font-semibold">
              QR 코드로 등록하기
            </span>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
