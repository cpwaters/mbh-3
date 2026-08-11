import { useEffect, useRef, useState } from 'react';

export interface Timer {
  id: string;
  title: string;
  initialSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isCustomizable?: boolean;
  minHours?: number;
  maxHours?: number;
}

export interface DrivingTimersView {
  timers: Timer[];
  dailyRestHours: number;
  toggleTimer: (id: string) => void;
  resetTimer: (id: string) => void;
  updateDailyRestHours: (hours: number) => void;
}

const INITIAL_TIMERS: Timer[] = [
  {
    id: 'driving',
    title: 'Driving Time',
    initialSeconds: 4 * 3600 + 30 * 60, // 4h 30m
    remainingSeconds: 4 * 3600 + 30 * 60,
    isRunning: false,
  },
  {
    id: 'break15',
    title: 'Break 15 mins',
    initialSeconds: 15 * 60,
    remainingSeconds: 15 * 60,
    isRunning: false,
  },
  {
    id: 'break30',
    title: 'Break 30 mins',
    initialSeconds: 30 * 60,
    remainingSeconds: 30 * 60,
    isRunning: false,
  },
  {
    id: 'break45',
    title: 'Break 45 mins',
    initialSeconds: 45 * 60,
    remainingSeconds: 45 * 60,
    isRunning: false,
  },
  {
    id: 'dailyRest',
    title: 'Daily Rest',
    initialSeconds: 9 * 3600, // 9 hours default
    remainingSeconds: 9 * 3600,
    isRunning: false,
    isCustomizable: true,
    minHours: 9,
    maxHours: 12,
  },
];

// Owned once at the app root (DriverApp), like device location and the sync
// queue — so the countdowns keep running (and their remaining time/isRunning
// state survives) when the driver navigates away from the Driving Time page
// and back. React Router unmounts the page component on route change;
// component-local state would have reset to the defaults on remount.
export function useDrivingTimers(): DrivingTimersView {
  const [timers, setTimers] = useState<Timer[]>(INITIAL_TIMERS);
  const [dailyRestHours, setDailyRestHours] = useState(9);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (timers.some((t) => t.isRunning)) {
      intervalRef.current = window.setInterval(() => {
        setTimers((prevTimers) =>
          prevTimers.map((timer) => {
            if (timer.isRunning && timer.remainingSeconds > 0) {
              return { ...timer, remainingSeconds: timer.remainingSeconds - 1 };
            }
            if (timer.isRunning && timer.remainingSeconds === 0) {
              return { ...timer, isRunning: false };
            }
            return timer;
          })
        );
      }, 1000);
    } else if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timers]);

  function toggleTimer(id: string): void {
    setTimers((prevTimers) =>
      prevTimers.map((timer) => (timer.id === id ? { ...timer, isRunning: !timer.isRunning } : timer))
    );
  }

  function resetTimer(id: string): void {
    setTimers((prevTimers) =>
      prevTimers.map((timer) =>
        timer.id === id ? { ...timer, remainingSeconds: timer.initialSeconds, isRunning: false } : timer
      )
    );
  }

  function updateDailyRestHours(hours: number): void {
    setDailyRestHours(hours);
    const newSeconds = hours * 3600;
    setTimers((prevTimers) =>
      prevTimers.map((timer) =>
        timer.id === 'dailyRest'
          ? { ...timer, initialSeconds: newSeconds, remainingSeconds: newSeconds, isRunning: false }
          : timer
      )
    );
  }

  return { timers, dailyRestHours, toggleTimer, resetTimer, updateDailyRestHours };
}
