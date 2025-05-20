import React, { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { COLORS } from "@/constants/colors";
import { useCartStore } from "@/stores/cart";
import { usePaymentStore } from "@/stores/payment";

export default function PaymentComplete(): React.ReactElement {
  const { getTotalAmount, clearCart } = useCartStore();
  const { orderId, resetPayment } = usePaymentStore();
  const navigate = useNavigate();
  const autoRedirectTimerRef = useRef<number | null>(null);
  const isMounted = useRef<boolean>(true);

  const handleGoToMenu = useCallback(() => {
    if (!isMounted.current) return;
    resetPayment();
    clearCart();
    navigate("/products");
  }, [clearCart, resetPayment, navigate]);

  useEffect(() => {
    isMounted.current = true;

    if (!orderId) {
      if (isMounted.current) {
        navigate("/products");
      }
      return;
    }

    autoRedirectTimerRef.current = window.setTimeout(() => {
      if (isMounted.current) {
        handleGoToMenu();
      }
    }, 10000);

    return () => {
      isMounted.current = false;
      if (autoRedirectTimerRef.current) {
        clearTimeout(autoRedirectTimerRef.current);
        autoRedirectTimerRef.current = null;
      }
    };
  }, [handleGoToMenu, orderId, navigate]);

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="py-4 flex items-center justify-center border-b border-gray-100 bg-white">
        <h1 className="text-2xl font-bold text-gray-900">
          <span className="text-primary-500">Flick</span> Place
        </h1>
      </header>

      <motion.main
        className="flex-1 flex flex-col justify-center items-center px-6 py-6 bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.img
          src="/assets/images/check.png"
          alt="결제 완료"
          className="w-28 h-28 mb-8"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        />

        <motion.h2
          className="text-4xl font-bold text-gray-900 mb-4"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          결제 완료
        </motion.h2>

        <motion.p
          className="text-lg text-gray-600 text-center mb-12 font-medium"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          주문이 성공적으로 완료되었습니다
        </motion.p>

        <motion.div
          className="w-full flex justify-evenly mb-10"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <div className="flex flex-col items-center px-6">
            <span className="text-base text-gray-600 mb-2 font-medium">
              결제 금액
            </span>
            <span className="text-2xl font-bold text-gray-900">
              {getTotalAmount().toLocaleString()}원
            </span>
          </div>

          <div className="flex flex-col items-center px-6">
            <span className="text-base text-gray-600 mb-2 font-medium">
              결제 시간
            </span>
            <span className="text-2xl font-bold text-gray-900">
              {`${new Date().toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
            </span>
          </div>
        </motion.div>

        <motion.p
          className="text-sm text-gray-500 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          10초 후 자동으로 화면이 전환됩니다
        </motion.p>

        <motion.button
          className="bg-primary-500 py-4 px-6 rounded-xl w-3/5 text-center text-white text-lg font-semibold"
          onClick={handleGoToMenu}
          whileTap={{ scale: 0.98 }}
          whileHover={{ backgroundColor: COLORS.primary600 }}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          메뉴로 돌아가기
        </motion.button>
      </motion.main>
    </div>
  );
}
