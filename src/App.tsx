import { useEffect, useState, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { motion, AnimatePresence } from "framer-motion";
import { Toaster } from "react-hot-toast";
import LoginPage from "@/pages/login";
import QrScannerPage from "@/pages/qr-scanner";
import ProductsPage from "@/pages/products";
import PaymentPage from "@/pages/payment";
import PaymentCompletePage from "@/pages/payment-complete";
import NotFoundPage from "@/pages/not-found";
import Providers from "@/components/providers";

function AppRoutes() {
  const { authenticated, initialized } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef<boolean>(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (initialized && isMounted.current) {
      setIsLoading(false);
    }
  }, [initialized]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <motion.div
          className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route
          path="/"
          element={
            authenticated ? (
              <Navigate to="/products" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/login"
          element={
            !authenticated ? <LoginPage /> : <Navigate to="/products" replace />
          }
        />

        <Route
          path="/auth/qr"
          element={
            !authenticated ? (
              <QrScannerPage />
            ) : (
              <Navigate to="/products" replace />
            )
          }
        />

        <Route
          path="/products"
          element={
            authenticated ? <ProductsPage /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/payment"
          element={
            authenticated ? <PaymentPage /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/payment-complete"
          element={
            authenticated ? (
              <PaymentCompletePage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <div className="flex flex-col min-h-screen bg-white">
          <AppRoutes />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: "#FFFFFF",
                color: "#333333",
                boxShadow: "0 3px 10px rgba(0, 0, 0, 0.1)",
                borderRadius: "8px",
                padding: "12px 20px",
              },
              success: {
                iconTheme: {
                  primary: "#10B981",
                  secondary: "#FFFFFF",
                },
              },
              error: {
                iconTheme: {
                  primary: "#EF4444",
                  secondary: "#FFFFFF",
                },
              },
            }}
          />
        </div>
      </Providers>
    </BrowserRouter>
  );
}
