import type { ReactNode } from "react";
import { toast as baseToast } from "@/hooks/use-toast";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

type AppToastOptions = {
  description?: ReactNode;
  duration?: number;
  className?: string;
  action?: ToastActionElement;
  id?: string | number;
  position?: string;
};

type AppToastVariant = NonNullable<ToastProps["variant"]>;

type AppToast = {
  (message: ReactNode, options?: AppToastOptions): ReturnType<typeof baseToast>;
  success(message: ReactNode, options?: AppToastOptions): ReturnType<typeof baseToast>;
  error(message: ReactNode, options?: AppToastOptions): ReturnType<typeof baseToast>;
  warning(message: ReactNode, options?: AppToastOptions): ReturnType<typeof baseToast>;
  info(message: ReactNode, options?: AppToastOptions): ReturnType<typeof baseToast>;
  dismiss(id?: string): void;
};

function show(message: ReactNode, options: AppToastOptions = {}, variant: AppToastVariant = "default") {
  const { description, duration, className, action } = options;
  const created = baseToast({
    title: message,
    description,
    duration,
    className,
    action,
    variant,
  });

  window.setTimeout(created.dismiss, duration ?? 4000);
  return created;
}

const toast = Object.assign(
  (message: ReactNode, options?: AppToastOptions) => show(message, options),
  {
    success: (message: ReactNode, options?: AppToastOptions) => show(message, options, "success"),
    error: (message: ReactNode, options?: AppToastOptions) => show(message, options, "destructive"),
    warning: (message: ReactNode, options?: AppToastOptions) => show(message, options, "warning"),
    info: (message: ReactNode, options?: AppToastOptions) => show(message, options, "info"),
    dismiss: (id?: string) => {
      window.dispatchEvent(new CustomEvent("app-toast-dismiss", { detail: { id } }));
    },
  },
) as AppToast;

function Toaster() {
  return null;
}

export { toast, Toaster };
