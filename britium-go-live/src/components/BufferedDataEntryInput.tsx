import { memo, useEffect, useRef, useState } from 'react';

/** Keep keystrokes local. Commit on blur, before a subsequent Save/Calculate click. */
export default memo(function BufferedDataEntryInput({value, onCommit, multiline = false, ...props}: {
  value: string | number; onCommit: (value: string) => void; multiline?: boolean;
  className?: string; type?: string; step?: string; min?: string; rows?: number; placeholder?: string;
}) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(String(value ?? '')); }, [value]);
  const shared = {
    ...props, value: draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dirty.current = true;
      setDraft(event.target.value);
    },
    onBlur: () => {
      const changed = dirty.current;
      dirty.current = false;
      if (changed && draft !== String(value ?? '')) onCommit(draft);
    },
  };
  return multiline ? <textarea {...shared}/> : <input {...shared}/>;
});
