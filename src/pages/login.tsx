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
    // clearErrors,
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

  // const goToQrScanner = useCallback(() => {
  //   if (!isMounted.current) return;
  //   if (loginMutation.isPending) return;

  //   clearErrors();
  //   navigate("/auth/qr");
  // }, [loginMutation.isPending, clearErrors, navigate]);

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
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      <header className="flex items-center px-6 py-4 border-b border-[#F1F5F9] h-16">
        <img
          src="/assets/images/logo.png"
          alt="Logo"
          className="w-9 h-9 mr-3"
        />
        <h1 className="text-2xl font-bold text-[#1E293B]">
          <span className="text-[#6366F1]">Flick</span> Place
        </h1>
      </header>

      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="w-full max-w-md px-6 py-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h2 className="text-2xl font-bold text-[#1E293B] mb-7 text-center">
            키오스크 로그인
          </h2>

          {errors.root?.message && (
            <motion.div
              className="flex items-center bg-[#FEF2F2] py-3.5 px-4 rounded-lg mb-6 border border-[#FEE2E2]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <svg
                className="w-5 h-5 text-[#EF4444] mr-2"
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
              <span className="flex-1 text-sm font-medium text-[#DC2626]">
                {errors.root.message}
              </span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mb-6">
            <div className="mb-5">
              <div className="flex justify-between items-center mb-2">
                <label
                  htmlFor="username"
                  className="text-sm font-medium text-[#475569]"
                >
                  아이디
                </label>
                {errors.username?.message && (
                  <motion.span
                    className="text-sm font-medium text-[#EF4444]"
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
                className={`w-full h-14 rounded-lg px-4 text-base text-[#1E293B] ${
                  focusedField === "username"
                    ? "border-2 border-[#6366F1] bg-[#FFFFFF]"
                    : "border border-[#E2E8F0] bg-[#F8FAFC]"
                } ${errors.username ? "border-[#EF4444]" : ""}`}
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
                  className="text-sm font-medium text-[#475569]"
                >
                  비밀번호
                </label>
                {errors.password?.message && (
                  <motion.span
                    className="text-sm font-medium text-[#EF4444]"
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
                className={`w-full h-14 rounded-lg px-4 text-base text-[#1E293B] ${
                  focusedField === "password"
                    ? "border-2 border-[#6366F1] bg-[#FFFFFF]"
                    : "border border-[#E2E8F0] bg-[#F8FAFC]"
                } ${errors.password ? "border-[#EF4444]" : ""}`}
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
                  ? "bg-[#CBD5E1] cursor-not-allowed"
                  : "bg-[#6366F1] hover:bg-[#4F46E5]"
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
                <div className="w-5 h-5 border-2 border-[#FFFFFF] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span className="text-[#FFFFFF] text-base font-semibold">
                  로그인
                </span>
              )}
            </motion.button>
          </form>
          {/* 
          <div className="flex items-center my-6">
            <div className="flex-1 h-px bg-[#E2E8F0]"></div>
            <span className="mx-4 text-sm text-[#64748B]">또는</span>
            <div className="flex-1 h-px bg-[#E2E8F0]"></div>
          </div>

          <motion.button
            className={`w-full h-14 rounded-lg flex items-center justify-center border border-[#6366F1] ${
              loginMutation.isPending
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-[#EEF2FF]"
            }`}
            onClick={goToQrScanner}
            disabled={loginMutation.isPending}
            whileTap={loginMutation.isPending ? {} : { scale: 0.98 }}
          >
            <svg
              className="w-5 h-5 text-[#6366F1] mr-2.5"
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
            <span className="text-[#6366F1] text-base font-semibold">
              QR 코드로 등록하기
            </span> */}
          {/* </motion.button> */}
        </motion.div>
      </div>
    </div>
  );
}
