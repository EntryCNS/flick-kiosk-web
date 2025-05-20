import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

export default function AuthLayout() {
  const location = useLocation();

  return (
    <div className="flex flex-col h-screen bg-white">
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          className="h-full"
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ duration: 0.25 }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
