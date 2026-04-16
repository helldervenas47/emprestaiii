import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// The VAPID public key must be set via the secret added to the project.
// We fetch it from the edge function or hardcode the public one here.
// Public VAPID keys are safe to expose in client code.
const VAPID_PUBLIC_KEY = "BDSknih4ImnAFRrO5UiitinHcs4tMGOds1cuOQHcV6yIvWKZjXisAHh7C7QEV04oHvkhFcxk5OzHVitM9MdHDSU";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }

    if (supported && user) {
      checkExistingSubscription();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const subscribe = useCallback(async () => {
    if (!user || !isSupported) return false;
    setIsLoading(true);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setIsLoading(false);
        return false;
      }

      const registration = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      const endpoint = json.endpoint!;
      const p256dh = json.keys!.p256dh!;
      const auth = json.keys!.auth!;

      const { error } = await supabase.from("push_tokens" as any).upsert(
        { user_id: user.id, endpoint, p256dh, auth },
        { onConflict: "user_id,endpoint" }
      );

      if (error) throw error;

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscribe error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();

          await supabase
            .from("push_tokens" as any)
            .delete()
            .eq("user_id", user.id)
            .eq("endpoint", endpoint);
        }
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  return { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe };
}
