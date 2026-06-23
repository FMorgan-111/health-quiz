"use client";

interface LikertOption {
  label: string;
  value: number;
  order: number;
}

interface LikertProps {
  options: LikertOption[];
  value: number | null;
  onChange: (value: number) => void;
}

export default function Likert({ options, value, onChange }: LikertProps) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
              selected
                ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200"
                : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
            }`}
          >
            <span className="font-medium">{opt.label}</span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
              }`}
            >
              {selected && <span className="h-2 w-2 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
