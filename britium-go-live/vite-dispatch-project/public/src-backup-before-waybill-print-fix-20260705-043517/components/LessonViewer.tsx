// @section: lesson-viewer
import { useState } from 'react';
import { TrainingModule, Lesson, QuizQuestion } from '../data/trainingModules';

const NAVY = '#0A1628';
const GOLD = '#D4AF37';
const C = { pass: '#22c55e', fail: '#ef4444', warn: '#f59e0b', info: '#3b82f6' };

interface Props {
  module: TrainingModule;
  onLessonComplete: (lessonId: string) => void;
  onQuizSubmit: (score: number) => void;
  completedLessons: string[];
  quizScore: number | null;
  quizAttempted: boolean;
  onBack: () => void;
}

function LessonPanel({ lesson, isComplete, onComplete }: { lesson: Lesson; isComplete: boolean; onComplete: () => void }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ marginBottom: 16, border: `1px solid ${isComplete ? '#22c55e44' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, overflow: 'hidden', background: isComplete ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.03)' }}>
      <div
        onClick={() => setExpanded(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${isComplete ? C.pass : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: isComplete ? C.pass : 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
          {isComplete ? '✓' : '○'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: isComplete ? C.pass : '#fff' }}>{lesson.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{lesson.overview.slice(0, 80)}…</div>
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 20px 20px' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 16 }}>{lesson.overview}</p>

          {/* Steps */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>Step-by-Step Guide</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(lesson.steps ?? []).map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5, color: step.startsWith('  ') ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '8px 12px', lineHeight: 1.5 }}>
                  {!step.startsWith('  ') && (
                    <span style={{ color: GOLD, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, minWidth: 20 }}>{i + 1}.</span>
                  )}
                  <span style={{ marginLeft: step.startsWith('  ') ? 30 : 0 }}>{step.trim()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Key Rules */}
          {(lesson.keyRules ?? []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Key Rules</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lesson.keyRules.map((rule, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.7)', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 7, padding: '7px 12px' }}>
                    <span style={{ color: GOLD, flexShrink: 0 }}>⚡</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tip */}
          {lesson.tip && (
            <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, marginBottom: 16 }}>
              <span style={{ color: C.info, fontWeight: 700 }}>💡 Tip: </span>{lesson.tip}
            </div>
          )}

          {!isComplete && (
            <button
              onClick={onComplete}
              style={{ background: GOLD, color: NAVY, border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              MARK COMPLETE ✓
            </button>
          )}
          {isComplete && (
            <div style={{ fontSize: 12, color: C.pass, fontWeight: 600 }}>✓ Lesson completed</div>
          )}
        </div>
      )}
    </div>
  );
}

function QuizPanel({ questions, onSubmit, quizScore, quizAttempted }: { questions: QuizQuestion[]; onSubmit: (score: number) => void; quizScore: number | null; quizAttempted: boolean }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(quizAttempted);
  const [score, setScore] = useState<number | null>(quizScore);

  const allAnswered = questions.every((_, i) => answers[i] !== undefined);

  const handleSubmit = () => {
    let s = 0;
    questions.forEach((q, i) => { if (answers[i] === q.correct) s++; });
    setScore(s);
    setSubmitted(true);
    onSubmit(s);
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, marginBottom: 4 }}>Knowledge Check</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
        {submitted ? `Score: ${score}/${questions.length} — ${(score ?? 0) >= 2 ? '✅ PASSED' : '❌ Review the lessons and retry'}` : `${questions.length} questions — answer all to submit`}
      </div>

      {questions.map((q, qi) => {
        const chosen = answers[qi];
        const isCorrect = chosen === q.correct;
        return (
          <div key={qi} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 10, lineHeight: 1.5 }}>
              <span style={{ color: GOLD, marginRight: 6 }}>{qi + 1}.</span>{q.question}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.options.map((opt, oi) => {
                let bg = 'rgba(255,255,255,0.04)';
                let border = 'rgba(255,255,255,0.1)';
                let color = 'rgba(255,255,255,0.7)';
                if (submitted) {
                  if (oi === q.correct) { bg = 'rgba(34,197,94,0.12)'; border = '#22c55e66'; color = C.pass; }
                  else if (oi === chosen && !isCorrect) { bg = 'rgba(239,68,68,0.12)'; border = '#ef444466'; color = C.fail; }
                } else if (chosen === oi) {
                  bg = 'rgba(212,175,55,0.12)'; border = '#D4AF3766'; color = GOLD;
                }
                return (
                  <div
                    key={oi}
                    onClick={() => !submitted && setAnswers(p => ({ ...p, [qi]: oi }))}
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 14px', borderRadius: 8, background: bg, border: `1px solid ${border}`, cursor: submitted ? 'default' : 'pointer', fontSize: 12.5, color, lineHeight: 1.4, transition: 'all 0.15s' }}
                  >
                    <span style={{ flexShrink: 0, fontWeight: 700, minWidth: 20 }}>{String.fromCharCode(65 + oi)}.</span>
                    <span>{opt}</span>
                  </div>
                );
              })}
            </div>
            {submitted && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '7px 12px', lineHeight: 1.5 }}>
                <span style={{ color: GOLD, fontWeight: 600 }}>Explanation: </span>{q.explanation}
              </div>
            )}
          </div>
        );
      })}

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          style={{ background: allAnswered ? GOLD : 'rgba(255,255,255,0.1)', color: allAnswered ? NAVY : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 12, fontWeight: 700, cursor: allAnswered ? 'pointer' : 'default', letterSpacing: '0.05em' }}
        >
          SUBMIT ANSWERS
        </button>
      ) : (
        <button
          onClick={() => { setAnswers({}); setSubmitted(false); setScore(null); }}
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 24px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          Retry Quiz
        </button>
      )}
    </div>
  );
}

export default function LessonViewer({ module, onLessonComplete, onQuizSubmit, completedLessons, quizScore, quizAttempted, onBack }: Props) {
  const allLessonsDone = module.lessons.every(l => completedLessons.includes(l.id));
  const passed = quizAttempted && quizScore !== null && quizScore >= 2;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, paddingTop: 28 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
          <div style={{ fontSize: 32 }}>{module.icon}</div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Module {module.number}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{module.title}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{module.subtitle}</div>
          </div>
        </div>
        {passed && (
          <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e66', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: C.pass, letterSpacing: '0.08em', textAlign: 'center' }}>
            🏆 COMPLETE<br /><span style={{ fontSize: 10, fontWeight: 400 }}>{quizScore}/3 Quiz Score</span>
          </div>
        )}
      </div>

      {/* Roles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Relevant roles:</span>
        {module.roles.map(r => (
          <span key={r} style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 8px', color: 'rgba(255,255,255,0.55)' }}>{r}</span>
        ))}
      </div>

      {/* Overview */}
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
        {module.overview}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
          <span>Lessons: {completedLessons.length} / {module.lessons.length}</span>
          <span>{Math.round((completedLessons.length / module.lessons.length) * 100)}%</span>
        </div>
        <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(completedLessons.length / module.lessons.length) * 100}%`, background: module.color, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Lessons */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>Lessons</div>
        {module.lessons.map(lesson => (
          <LessonPanel
            key={lesson.id}
            lesson={lesson}
            isComplete={completedLessons.includes(lesson.id)}
            onComplete={() => onLessonComplete(lesson.id)}
          />
        ))}
      </div>

      {/* Quiz */}
      {allLessonsDone && (
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>Knowledge Quiz</div>
          <QuizPanel
            questions={module.quiz}
            onSubmit={onQuizSubmit}
            quizScore={quizScore}
            quizAttempted={quizAttempted}
          />
        </div>
      )}

      {!allLessonsDone && (
        <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          Complete all lessons above to unlock the Knowledge Quiz
        </div>
      )}
    </div>
  );
}
