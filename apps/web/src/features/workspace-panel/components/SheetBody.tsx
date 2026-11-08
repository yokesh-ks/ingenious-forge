import { Workbook } from "@fortune-sheet/react";
import fortuneCss from "@fortune-sheet/react/dist/index.css?inline";
import { TriangleAlertIcon } from "lucide-react";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ExcelFormat } from "../vendor/sheet/format";
import type { ExcelLimits, ExcelPreview } from "../vendor/sheet/model";
import { parseExcel } from "../vendor/sheet/parse";
import DocumentLoading from "./DocumentLoading";

const LIMITS: ExcelLimits = { maxBytes: 16 * 1024 * 1024, maxCells: 250_000, timeoutMs: 15_000 };

const scopedStyles = `@scope ([data-excel-preview]) { ${fortuneCss} }
[data-excel-preview] .luckysheet-cs-draghandle, [data-excel-preview] .luckysheet-cs-fillhandle { box-sizing: content-box; }
[data-excel-preview] .fortune-stat-area,
[data-excel-preview] .luckysheet-sheets-item-function,
[data-excel-preview] .fortune-cols-freeze-handle,
[data-excel-preview] .fortune-rows-freeze-handle { display: none; }
[data-excel-preview] .luckysheet-sheet-area div.luckysheet-sheets-item { padding-right: 5px; }
[data-excel-preview] .luckysheet-sheet-area { padding: 0; }
[data-excel-preview] #luckysheet-sheet-content { flex: 1; min-width: 0; }
[data-excel-preview] .fortune-sheettab-container { flex: 1; min-width: 0; max-width: 100%; }
[data-excel-preview] .fortune-sheettab-container .fortune-sheettab-container-c { overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: none; }
[data-excel-preview] .fortune-sheettab-scroll, [data-excel-preview] .fortune-sheet-area-right { flex: none; }
[data-excel-preview] .fortune-fx-input-container { min-width: 0; }
[data-excel-preview] .fortune-fx-input { min-width: 0; overflow-x: auto; overflow-y: hidden; white-space: nowrap; scrollbar-width: none; }
[data-excel-formulas] .fortune-fx-input { padding-left: 24px; }`;

const MESSAGES: Record<string, string> = {
  invalid:
    "This spreadsheet could not be opened. Check its format, contents, or password protection.",
  tooLarge: "This workbook exceeds the preview size limit.",
  timeout: "Opening this workbook timed out. Try again or open it in a system application.",
  encoding:
    "This text encoding could not be read. Save the file as UTF-8 or UTF-16 with a BOM and retry.",
};

const FEATURES: Record<string, string> = {
  charts: "charts",
  images: "images",
  shapes: "shapes",
  conditionalFormatting: "conditional formatting",
};

const FORMULA_WARNING =
  "This workbook contains formulas. Displayed results may be missing or inaccurate.";

const SELECT_AFTER_MS = 300;

type State = { data: Uint8Array } & ({ value: ExcelPreview } | { error: string });

/** A workbook, CSV or TSV in a read-only spreadsheet. */
export default function SheetBody({ data, format }: { data: Uint8Array; format: ExcelFormat }) {
  const [state, setState] = useState<State>();
  const [attempt, setAttempt] = useState(0);
  const book = useRef<HTMLDivElement>(null);
  const workbook = useRef<ComponentRef<typeof Workbook>>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt asks for another try
  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);
    parseExcel(data as Uint8Array<ArrayBuffer>, format, LIMITS, controller.signal).then(
      (value) => !controller.signal.aborted && setState({ data, value }),
      (error: unknown) =>
        !controller.signal.aborted &&
        setState({ data, error: error instanceof Error ? error.message : "invalid" }),
    );
    return () => controller.abort();
  }, [data, format, attempt]);

  // The sheet measures itself on window resizes, which a pane's resize is not.
  // biome-ignore lint/correctness/useExhaustiveDependencies: it re-attaches once the sheet exists
  useEffect(() => {
    const element = book.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
    observer.observe(element);
    return () => observer.disconnect();
  }, [state]);

  // The sheet's first selection comes out unsized, so it is set again once
  // the rows are measured. StrictMode's second run of that update would write
  // to what the first froze, so development goes without.
  useEffect(() => {
    if (import.meta.env.DEV || !state || "error" in state) return;
    const selection = state.value.sheets.find((s) => s.status === 1)?.luckysheet_select_save;
    if (!selection) return;
    const fresh = selection.map((range) => ({ ...range }));
    const timer = window.setTimeout(() => workbook.current?.setSelection(fresh), SELECT_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state?.data !== data) {
    return <DocumentLoading />;
  }
  if ("error" in state) {
    return (
      <div
        role="alert"
        className="flex h-full items-center justify-center gap-2 p-4 text-muted-foreground"
      >
        <span>{MESSAGES[state.error] ?? MESSAGES.invalid}</span>
        <button
          type="button"
          className="rounded-md border-[0.5px] border-border px-2.5 py-1 text-xs hover:bg-muted"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </button>
      </div>
    );
  }
  const { sheets, unsupportedFeatures } = state.value;
  const hasFormulas = sheets.some((sheet) =>
    sheet.celldata?.some((cell) => cell.v?.f !== undefined),
  );
  return (
    <section
      data-excel-preview=""
      aria-label="Spreadsheet"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <style>{scopedStyles}</style>
      {unsupportedFeatures.length > 0 && (
        <div
          role="note"
          className="flex flex-none items-start gap-2 bg-amber-500/10 px-3 py-2 text-[13px] leading-normal text-amber-700 dark:text-amber-400"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 flex-none" />
          <span>
            This preview does not support{" "}
            {unsupportedFeatures.map((feature) => FEATURES[feature]).join(", ")} in this workbook.
            Open it in a system application to see them.
          </span>
        </div>
      )}
      <div
        ref={book}
        data-excel-formulas={hasFormulas || undefined}
        className="relative min-h-0 min-w-0 flex-1 text-[CanvasText] [color-scheme:light]"
      >
        {hasFormulas && (
          <TooltipProvider>
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={FORMULA_WARNING}
                  className="absolute top-1 left-[142px] z-[3] flex size-5 rounded p-[3px] text-amber-700 hover:bg-amber-500/10"
                >
                  <TriangleAlertIcon aria-hidden className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{FORMULA_WARNING}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <Workbook
          key={attempt}
          ref={workbook}
          data={sheets}
          lang="en"
          allowEdit={false}
          showToolbar={false}
          showFormulaBar
          showSheetTabs
          forceCalculation={false}
          cellContextMenu={["copy"]}
          headerContextMenu={[]}
          sheetTabContextMenu={[]}
          filterContextMenu={[]}
        />
      </div>
    </section>
  );
}
