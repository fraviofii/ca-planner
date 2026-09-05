"use client";

import type { CategoryGroupDto } from "@/lib/client";

interface Props {
  groups: CategoryGroupDto[];
  value: string | null; // id da categoria, null = sem categoria
  onChange: (id: string | null) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function CategorySelect({ groups, value, onChange, className = "", disabled, placeholder = "Sem categoria" }: Props) {
  return (
    <select
      className={`input ${className}`}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
