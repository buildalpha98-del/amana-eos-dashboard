"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useTimer(durationMinutes: number) {
  const [totalSeconds, setTotalSeconds] = useState(durationMinutes * 60);
  const [isRunning, setIsRunning] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning && totalSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setTotalSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, totalSeconds]);

  const reset = useCallback((minutes: number) => {
    setTotalSeconds(minutes * 60);
    setIsRunning(true);
  }, []);

  const toggle = useCallback(() => setIsRunning((r) => !r), []);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isOvertime = totalSeconds === 0 && isRunning;

  return { minutes, seconds, isRunning, isOvertime, toggle, reset, totalSeconds };
}
