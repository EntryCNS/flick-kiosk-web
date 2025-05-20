import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/constants/api";
import { isAxiosError } from "axios";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { usePaymentStore } from "@/stores/payment";
import api from "@/libs/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ProductResponse {
  id: number;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  status: "AVAILABLE" | "SOLD_OUT" | "HIDDEN";
  stock: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateOrderItemRequest {
  productId: number;
  quantity: number;
}

interface CreateOrderRequest {
  items: CreateOrderItemRequest[];
}

const ERROR_CODES: Record<string, string> = {
  INSUFFICIENT_STOCK: "재고가 부족합니다",
  PRODUCT_NOT_FOUND: "일부 상품이 판매 불가능합니다",
  PRODUCT_UNAVAILABLE: "판매 중단된 상품이 포함되어 있습니다",
};

export default function ProductsScreen() {
  const [secretTapCount, setSecretTapCount] = useState(0);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const { signOut } = useAuthStore();
  const {
    items: cart,
    addItem,
    updateQuantity,
    clearCart,
    getTotalAmount,
    getTotalItems,
  } = useCartStore();
  const { createPayment } = usePaymentStore();

  const {
    data: products = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const response = await api.get<ProductResponse[]>(
        `${API_URL}/products/available`
      );
      return response.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  const orderMutation = useMutation({
    mutationFn: (orderRequest: CreateOrderRequest) => {
      return api.post(`${API_URL}/orders`, orderRequest, {
        headers: {
          Authorization: `Bearer ${useAuthStore.getState().token}`,
        },
      });
    },
    onSuccess: (response) => {
      if (response.data?.id) {
        createPayment(response.data.id);
        navigate("/payment");
      } else {
        throw new Error("주문 생성 실패");
      }
    },
    onError: (error) => {
      let errorMessage = "주문 처리에 실패했습니다";

      if (isAxiosError(error) && error.response?.data) {
        try {
          const errorData = error.response.data;
          if (errorData?.code && ERROR_CODES[errorData.code]) {
            errorMessage = ERROR_CODES[errorData.code];
          }
        } catch (e) {
          console.error("Error parsing response:", e);
        }
      }

      showAlert(errorMessage);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const showAlert = useCallback((message: string) => {
    setAlertMessage(message);
    setAlertVisible(true);

    setTimeout(() => {
      setAlertVisible(false);
    }, 3000);
  }, []);

  const handleSecretTap = useCallback(() => {
    const newCount = secretTapCount + 1;
    setSecretTapCount(newCount);

    if (newCount >= 7) {
      if (confirm("이 키오스크의 연결을 해제하시겠습니까?")) {
        signOut();
        clearCart();
        navigate("/login");
      }
      setSecretTapCount(0);
    }
  }, [secretTapCount, signOut, clearCart, navigate]);

  const handlePayment = useCallback(() => {
    if (cart.length === 0) {
      showAlert("상품을 선택해주세요");
      return;
    }

    const orderRequest: CreateOrderRequest = {
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    };

    orderMutation.mutate(orderRequest);
  }, [cart, orderMutation, showAlert]);

  const handleAddToCart = useCallback(
    (product: ProductResponse) => {
      if (product.status === "SOLD_OUT" || product.stock <= 0) {
        showAlert("품절된 상품입니다");
        return;
      }

      const existingItem = cart.find((item) => item.id === product.id);
      const currentQuantity = existingItem ? existingItem.quantity : 0;

      if (currentQuantity >= product.stock) {
        showAlert("재고가 부족합니다");
        return;
      }

      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
      });
    },
    [cart, addItem, showAlert]
  );

  const handleQuantityUpdate = useCallback(
    (id: number, newQuantity: number) => {
      if (newQuantity <= 0) {
        updateQuantity(id, 0);
        return;
      }

      const product = products.find((p) => p.id === id);
      if (product && newQuantity > product.stock) {
        showAlert("재고가 부족합니다");
        return;
      }
      updateQuantity(id, newQuantity);
    },
    [products, updateQuantity, showAlert]
  );

  return (
    <div className="flex flex-col h-screen bg-[#FFFFFF]">
      <motion.header
        className="flex items-center px-6 py-4 border-b border-[#F1F5F9] bg-[#FFFFFF] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="flex items-center cursor-pointer"
          onClick={handleSecretTap}
          whileTap={{ scale: 0.97 }}
        >
          <img
            src="/assets/images/logo.png"
            alt="Logo"
            className="w-10 h-10 mr-2.5"
          />
          <div>
            <h1 className="text-xl font-semibold text-[#1E293B]">
              <span className="text-[#4F46E5]">F</span>lick Place
            </h1>
          </div>
        </motion.div>
      </motion.header>

      <div className="flex flex-1">
        {/* Products Section */}
        <motion.div
          className="flex-grow p-5 bg-[#FFFFFF] overflow-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {isLoading && !isRefetching ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-10 h-10 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-base font-medium text-[#64748B]">
                상품을 불러오는 중...
              </p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-full">
              <svg
                className="w-12 h-12 text-[#EF4444]"
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
              <p className="mt-4 mb-6 text-base font-medium text-[#EF4444]">
                상품을 불러올 수 없습니다
              </p>
              <motion.button
                className="px-5 py-3 text-base font-semibold text-[#FFFFFF] bg-[#4F46E5] rounded-xl"
                onClick={() => refetch()}
                whileHover={{ backgroundColor: "#4338CA" }}
                whileTap={{ scale: 0.95 }}
              >
                다시 시도
              </motion.button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
              {products.map((product) => {
                const isSoldOut =
                  product.status === "SOLD_OUT" || product.stock <= 0;
                const cartItem = cart.find(
                  (cartItem) => cartItem.id === product.id
                );
                const inCart = cartItem !== undefined;

                return (
                  <motion.div
                    key={product.id}
                    className={`
                      flex flex-col border rounded-xl overflow-hidden h-56 relative cursor-pointer
                      ${isSoldOut ? "opacity-70 cursor-not-allowed" : ""}
                      ${
                        inCart
                          ? "border-2 border-[#4F46E5]"
                          : "border-[#E2E8F0]"
                      }
                    `}
                    onClick={() => !isSoldOut && handleAddToCart(product)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    whileHover={
                      !isSoldOut
                        ? { y: -5, boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }
                        : {}
                    }
                    whileTap={!isSoldOut ? { scale: 0.98 } : {}}
                  >
                    <div className="relative w-full h-36 bg-[#E2E8F0]">
                      <img
                        src={
                          product.imageUrl || "/assets/images/placeholder.png"
                        }
                        alt={product.name}
                        className="object-cover w-full h-full"
                      />
                      {isSoldOut && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#000000]/50">
                          <span className="px-4 py-2 text-lg font-bold text-[#FFFFFF] bg-[#000000]/60 rounded-full">
                            품절
                          </span>
                        </div>
                      )}
                      {inCart && (
                        <motion.div
                          className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 text-sm font-bold text-[#FFFFFF] bg-[#4F46E5] rounded-full"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 20,
                          }}
                        >
                          {cartItem.quantity}
                        </motion.div>
                      )}
                    </div>
                    <div className="flex flex-col justify-between flex-1 p-3">
                      <h3 className="text-base font-semibold text-[#1E293B] truncate">
                        {product.name}
                      </h3>
                      <div>
                        <p
                          className={`text-base font-bold ${
                            isSoldOut ? "text-[#64748B]" : "text-[#4F46E5]"
                          }`}
                        >
                          {product.price.toLocaleString()}원
                        </p>
                        {!isSoldOut && (
                          <p className="mt-1 text-xs text-[#64748B]">
                            재고: {product.stock}개
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Cart Section */}
        <motion.div
          className="w-1/4 min-w-80 flex flex-col border-l border-[#F1F5F9] bg-[#FFFFFF]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex justify-between items-center p-5 border-b border-[#F1F5F9] h-16">
            <h2 className="text-xl font-bold text-[#1E293B]">장바구니</h2>
            {cart.length > 0 && (
              <motion.button
                className="flex items-center px-3 py-1.5 text-sm font-medium text-[#FFFFFF] bg-[#EF4444] rounded-full"
                onClick={clearCart}
                whileHover={{ backgroundColor: "#e53e3e" }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                비우기
              </motion.button>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6">
                <svg
                  className="w-14 h-14 text-[#CBD5E1]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <p className="mt-4 text-base font-semibold text-[#64748B]">
                  장바구니가 비어있습니다
                </p>
                <p className="mt-2 text-sm font-medium text-[#64748B]">
                  상품을 선택해주세요
                </p>
              </div>
            ) : (
              <div className="px-5">
                <AnimatePresence>
                  {cart.map((item) => {
                    const product = products.find((p) => p.id === item.id);
                    const maxReached =
                      product && item.quantity >= product.stock;

                    return (
                      <motion.div
                        key={item.id}
                        className="flex justify-between items-center py-4 border-b border-[#F1F5F9]"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ duration: 0.2 }}
                      >
                        <motion.div
                          className="flex-1 mr-2 cursor-pointer"
                          onClick={() => updateQuantity(item.id, 0)}
                          whileTap={{ scale: 0.98 }}
                        >
                          <h3 className="text-base font-semibold text-[#1E293B] truncate">
                            {item.name}
                          </h3>
                          <div className="flex items-center">
                            <span className="text-[#4F46E5] text-base font-semibold">
                              {(item.price * item.quantity).toLocaleString()}원
                            </span>
                            <span className="ml-1 text-xs text-[#64748B]">
                              ({item.price.toLocaleString()}원/개)
                            </span>
                          </div>
                        </motion.div>
                        <div className="flex items-center">
                          <motion.button
                            className="flex items-center justify-center w-7 h-7 bg-[#6366F1] text-[#FFFFFF] rounded-full"
                            onClick={() =>
                              handleQuantityUpdate(item.id, item.quantity - 1)
                            }
                            whileHover={{ backgroundColor: "#4F46E5" }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M20 12H4"
                              />
                            </svg>
                          </motion.button>
                          <motion.span
                            className="mx-2.5 min-w-6 text-center text-base font-semibold"
                            key={item.quantity}
                            initial={{ scale: 1.2 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            {item.quantity}
                          </motion.span>
                          <motion.button
                            className={`flex items-center justify-center w-7 h-7 text-[#FFFFFF] rounded-full ${
                              maxReached ? "bg-[#CBD5E1]" : "bg-[#4F46E5]"
                            }`}
                            onClick={() =>
                              handleQuantityUpdate(item.id, item.quantity + 1)
                            }
                            disabled={maxReached}
                            whileHover={
                              !maxReached ? { backgroundColor: "#4338CA" } : {}
                            }
                            whileTap={!maxReached ? { scale: 0.9 } : {}}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                              />
                            </svg>
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="p-5 border-t border-[#F1F5F9] bg-[#FFFFFF]">
            <div className="flex justify-between mb-2.5">
              <span className="text-base font-medium text-[#64748B]">
                총 수량
              </span>
              <motion.span
                className="text-base font-semibold text-[#1E293B]"
                key={getTotalItems()}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                {getTotalItems()}개
              </motion.span>
            </div>
            <div className="flex justify-between mb-2.5">
              <span className="text-base font-medium text-[#64748B]">
                총 금액
              </span>
              <motion.span
                className="text-xl font-bold text-[#4F46E5]"
                key={getTotalAmount()}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                {getTotalAmount().toLocaleString()}원
              </motion.span>
            </div>
            <motion.button
              className={`
                flex items-center justify-center w-full py-4 mt-4 text-base font-semibold text-[#FFFFFF] rounded-xl
                ${
                  cart.length === 0 || orderMutation.isPending
                    ? "bg-[#CBD5E1]"
                    : "bg-[#4F46E5]"
                }
              `}
              onClick={handlePayment}
              disabled={cart.length === 0 || orderMutation.isPending}
              whileHover={
                cart.length > 0 && !orderMutation.isPending
                  ? { backgroundColor: "#4338CA" }
                  : {}
              }
              whileTap={
                cart.length > 0 && !orderMutation.isPending
                  ? { scale: 0.98 }
                  : {}
              }
            >
              {orderMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-[#FFFFFF] border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                  결제하기
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {alertVisible && (
          <motion.div
            className="fixed top-20 left-0 right-0 flex justify-center z-50"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="flex items-center px-5 py-4 bg-[#FFFFFF] rounded-xl shadow-md max-w-md"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
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
              <span className="ml-3 text-base font-medium text-[#1E293B]">
                {alertMessage}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
