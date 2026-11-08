import type { JsonValue } from "@/api/types";

const LIST = "m-0 list-none ps-4 font-mono";
const ITEM = "py-0.5 [overflow-wrap:anywhere] whitespace-pre-wrap";
const VALUE = "text-muted-foreground";

function Branch({ name, value }: { name: string; value: JsonValue }) {
  const field = <span>{name}: </span>;
  if (value === null || typeof value !== "object") {
    return (
      <li className={ITEM}>
        {field}
        <span className={VALUE}>{JSON.stringify(value)}</span>
      </li>
    );
  }
  const entries: [string, JsonValue][] = Object.entries(value);
  return (
    <li className={ITEM}>
      <details open>
        <summary className="cursor-pointer">
          {field}{" "}
          <span className={VALUE}>
            {Array.isArray(value) ? `Array(${value.length})` : "Object"}
          </span>
        </summary>
        <ul className={LIST}>
          {entries.map(([key, item]) => (
            <Branch key={key} name={key} value={item} />
          ))}
          {entries.length === 0 && <li className={VALUE}>Empty</li>}
        </ul>
      </details>
    </li>
  );
}

/** A record as a tree, every level open and folded one at a time. */
export default function RawDataTree({ value, label }: { value: JsonValue; label: string }) {
  return (
    <ul aria-label={label} className={LIST}>
      <Branch name="$" value={value} />
    </ul>
  );
}
