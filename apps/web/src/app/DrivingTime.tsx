import { useState, useEffect, useRef } from 'react';
import { Clock, Play, Pause, RotateCcw } from 'lucide-react';

// Ported verbatim from the mbh-2 prototype (client/src/pages/DrivingTime.tsx):
// self-contained HGV driving-hours + break countdown timers. No backend.

interface Timer {
  id: string;
  title: string;
  initialSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isCustomizable?: boolean;
  minHours?: number;
  maxHours?: number;
}

export default function DrivingTime() {
  const [timers, setTimers] = useState<Timer[]>([
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
  ]);

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
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timers]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const toggleTimer = (id: string) => {
    setTimers((prevTimers) =>
      prevTimers.map((timer) => (timer.id === id ? { ...timer, isRunning: !timer.isRunning } : timer))
    );
  };

  const resetTimer = (id: string) => {
    setTimers((prevTimers) =>
      prevTimers.map((timer) =>
        timer.id === id ? { ...timer, remainingSeconds: timer.initialSeconds, isRunning: false } : timer
      )
    );
  };

  const updateDailyRestHours = (hours: number) => {
    setDailyRestHours(hours);
    const newSeconds = hours * 3600;
    setTimers((prevTimers) =>
      prevTimers.map((timer) =>
        timer.id === 'dailyRest'
          ? { ...timer, initialSeconds: newSeconds, remainingSeconds: newSeconds, isRunning: false }
          : timer
      )
    );
  };

  const getTimerColor = (timer: Timer) => {
    const percentage = (timer.remainingSeconds / timer.initialSeconds) * 100;
    if (percentage > 50) return 'text-green-600';
    if (percentage > 25) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (timer: Timer) => {
    const percentage = (timer.remainingSeconds / timer.initialSeconds) * 100;
    if (percentage > 50) return 'bg-green-600';
    if (percentage > 25) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Driving Time</h1>
        <p className="text-gray-600">Manage your driving hours and breaks</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {timers.map((timer) => (
          <div key={timer.id} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">{timer.title}</h3>
            </div>

            {timer.isCustomizable && (
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-2">
                  Set Duration ({timer.minHours}-{timer.maxHours} hours)
                </label>
                <input
                  type="range"
                  min={timer.minHours}
                  max={timer.maxHours}
                  value={dailyRestHours}
                  onChange={(e) => updateDailyRestHours(Number(e.target.value))}
                  className="w-full"
                  disabled={timer.isRunning}
                />
                <div className="text-center text-sm font-medium text-gray-700 mt-1">{dailyRestHours} hours</div>
              </div>
            )}

            <div className={`text-5xl font-bold text-center mb-4 ${getTimerColor(timer)}`}>
              {formatTime(timer.remainingSeconds)}
            </div>

            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div
                className={`h-3 rounded-full transition-all ${getProgressColor(timer)}`}
                style={{ width: `${(timer.remainingSeconds / timer.initialSeconds) * 100}%` }}
              ></div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => toggleTimer(timer.id)}
                className={`flex-1 ${
                  timer.isRunning ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700'
                } text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2`}
                disabled={timer.remainingSeconds === 0}
              >
                {timer.isRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start
                  </>
                )}
              </button>
              <button
                onClick={() => resetTimer(timer.id)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {timer.remainingSeconds === 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800 text-center">
                  Time's up! {timer.id === 'driving' ? 'Take a break.' : 'Break complete.'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
