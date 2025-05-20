import React, { useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function NotFound(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const isMounted = useRef<boolean>(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleNavigateToHome = useCallback(() => {
    if (!isMounted.current) return;
    navigate("/products", { replace: true });
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen bg-secondary-50">
      <div className="flex-1 flex flex-col items-center justify-center p-5">
        <svg
          className="w-20 h-20 text-danger-500"
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

        <h1 className="text-2xl font-bold text-secondary-800 mt-5">
          페이지를 찾을 수 없습니다
        </h1>

        <p className="text-base font-medium text-secondary-500 text-center mt-2.5 mb-7.5">
          요청하신 경로 &quot;{pathname}&quot;를 찾을 수 없습니다.
        </p>

        <button
          className="bg-primary-500 py-3 px-6 rounded-lg text-base font-bold text-secondary-50"
          onClick={handleNavigateToHome}
        >
          메인으로 돌아가기
        </button>
      </div>
    </div>
  );
}
