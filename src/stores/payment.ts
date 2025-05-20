import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type PaymentRequestStatus = "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
type PaymentRequestMethod = "QR_CODE" | "STUDENT_ID";

interface PaymentState {
  orderId: number | null;
  requestId: number | null;
  requestCode: string | null;
  requestMethod: PaymentRequestMethod | null;
  expiresAt: string | null;
  timer: number;
  isActive: boolean;
  status: PaymentRequestStatus | null;

  createPayment: (orderId: number) => void;
  setPaymentRequest: (
    requestId: number,
    requestCode: string,
    status: PaymentRequestStatus,
    requestMethod: PaymentRequestMethod,
    expiresAt: string
  ) => void;
  setStatus: (status: PaymentRequestStatus) => void;
  decrementTimer: () => void;
  resetPayment: () => void;
  resetPaymentRequest: () => void;
  cancelPayment: () => void;
}

const DEFAULT_TIMER = 900;

const webStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return localStorage.getItem(name);
    } catch (error) {
      console.error("localStorage getItem error:", error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.error("localStorage setItem error:", error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      localStorage.removeItem(name);
    } catch (error) {
      console.error("localStorage removeItem error:", error);
    }
  },
};

export const usePaymentStore = create<PaymentState>()(
  persist(
    (set, get) => ({
      orderId: null,
      requestId: null,
      requestCode: null,
      requestMethod: null,
      expiresAt: null,
      timer: DEFAULT_TIMER,
      isActive: false,
      status: null,

      createPayment: (orderId) => {
        set({
          orderId,
          timer: DEFAULT_TIMER,
          isActive: true,
          status: "PENDING",
          requestId: null,
          requestCode: null,
          requestMethod: null,
          expiresAt: null,
        });
      },

      setPaymentRequest: (
        requestId,
        requestCode,
        status,
        requestMethod,
        expiresAt
      ) => {
        const { timer } = get();
        let updatedTimer = timer;

        if (expiresAt) {
          const expiryTime = new Date(expiresAt).getTime();
          const currentTime = new Date().getTime();
          const timeLeftInSeconds = Math.max(
            0,
            Math.floor((expiryTime - currentTime) / 1000)
          );

          if (timeLeftInSeconds < timer) {
            updatedTimer = timeLeftInSeconds;
          }
        }

        set({
          requestId,
          requestCode,
          status,
          requestMethod,
          expiresAt,
          isActive: status === "PENDING",
          timer: updatedTimer,
        });
      },

      setStatus: (status) => {
        set({
          status,
          isActive: status === "PENDING",
        });
      },

      decrementTimer: () => {
        const { timer, status } = get();

        if (timer <= 0) {
          set({ isActive: false, status: "EXPIRED" });
        } else if (status === "PENDING") {
          set({ timer: timer - 1 });
        }
      },

      resetPayment: () => {
        set({
          orderId: null,
          requestId: null,
          requestCode: null,
          requestMethod: null,
          expiresAt: null,
          timer: DEFAULT_TIMER,
          isActive: false,
          status: null,
        });
      },

      resetPaymentRequest: () => {
        const { orderId, timer } = get();
        set({
          orderId,
          requestId: null,
          requestCode: null,
          requestMethod: null,
          expiresAt: null,
          timer,
          isActive: true,
          status: "PENDING",
        });
      },

      cancelPayment: () => {
        set({
          isActive: false,
          status: "EXPIRED",
        });
      },
    }),
    {
      name: "kiosk-payment",
      storage: createJSONStorage(() => webStorage),
      partialize: (state) => ({
        orderId: state.orderId,
        requestId: state.requestId,
        requestCode: state.requestCode,
        requestMethod: state.requestMethod,
        expiresAt: state.expiresAt,
        timer: state.timer,
        isActive: state.isActive,
        status: state.status,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        if (!state.isActive || state.status !== "PENDING" || state.timer <= 0) {
          setTimeout(() => usePaymentStore.getState().resetPayment(), 0);
        }
      },
    }
  )
);
