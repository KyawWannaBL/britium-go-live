// @section: progress-hook
import { useState, useCallback } from 'react';
import { TRAINING_MODULES } from '../data/trainingModules';

const KEY = 'britium_training_progress';

export interface ModuleProgress {
  completedLessons: string[];
  quizScore: number | null;
  quizAttempted: boolean;
  completedAt?: string;
}

export interface TrainingProgress {
  modules: Record<string, ModuleProgress>;
  startedAt: string;
  userName: string;
}

function createFresh(userName = 'Trainee'): TrainingProgress {
  return {
    modules: {},
    startedAt: new Date().toISOString(),
    userName,
  };
}

function loadFromStorage(): TrainingProgress {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : createFresh();
  } catch { return createFresh(); }
}

function saveToStorage(p: TrainingProgress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota */ }
}

export function useProgress() {
  const [progress, setProgress] = useState<TrainingProgress>(loadFromStorage);

  const save = useCallback((next: TrainingProgress) => {
    saveToStorage(next);
    setProgress(next);
  }, []);

  const markLessonComplete = useCallback((moduleId: string, lessonId: string) => {
    setProgress(prev => {
      const mp = prev.modules[moduleId] ?? { completedLessons: [], quizScore: null, quizAttempted: false };
      if (mp.completedLessons.includes(lessonId)) return prev;
      const updated: TrainingProgress = {
        ...prev,
        modules: {
          ...prev.modules,
          [moduleId]: { ...mp, completedLessons: [...mp.completedLessons, lessonId] },
        },
      };
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const submitQuiz = useCallback((moduleId: string, score: number) => {
    setProgress(prev => {
      const mp = prev.modules[moduleId] ?? { completedLessons: [], quizScore: null, quizAttempted: false };
      const mod = TRAINING_MODULES.find(m => m.id === moduleId);
      const allLessonsDone = mod ? mod.lessons.every(l => mp.completedLessons.includes(l.id)) : false;
      const updated: TrainingProgress = {
        ...prev,
        modules: {
          ...prev.modules,
          [moduleId]: {
            ...mp,
            quizScore: score,
            quizAttempted: true,
            completedAt: allLessonsDone ? new Date().toISOString() : mp.completedAt,
          },
        },
      };
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const setUserName = useCallback((userName: string) => {
    setProgress(prev => { const n = { ...prev, userName }; saveToStorage(n); return n; });
  }, []);

  const resetAll = useCallback(() => {
    const fresh = createFresh(progress.userName);
    save(fresh);
  }, [progress.userName, save]);

  const getModuleProgress = useCallback((moduleId: string): ModuleProgress =>
    progress.modules[moduleId] ?? { completedLessons: [], quizScore: null, quizAttempted: false },
  [progress]);

  const getOverallStats = useCallback(() => {
    let totalLessons = 0, completedLessons = 0, passedQuizzes = 0;
    TRAINING_MODULES.forEach(m => {
      totalLessons += m.lessons.length;
      const mp = progress.modules[m.id];
      if (mp) {
        completedLessons += mp.completedLessons.length;
        if (mp.quizAttempted && mp.quizScore !== null && mp.quizScore >= 2) passedQuizzes++;
      }
    });
    const totalModules = TRAINING_MODULES.length;
    const completedModules = TRAINING_MODULES.filter(m => {
      const mp = progress.modules[m.id];
      return mp && mp.quizAttempted && mp.quizScore !== null && mp.quizScore >= 2 &&
             m.lessons.every(l => mp.completedLessons.includes(l.id));
    }).length;
    return { totalLessons, completedLessons, totalModules, completedModules, passedQuizzes };
  }, [progress]);

  return { progress, markLessonComplete, submitQuiz, setUserName, resetAll, getModuleProgress, getOverallStats };
}
