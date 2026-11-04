import { matchesSearch } from "@/utils/search";
import { useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { classifyLogLine } from "../../utils/log";
import { SearchBar } from "../components/SearchBar";
import { useApp } from "../state";
import { colors } from "../theme";

const PAGE_SIZE = 100;

export function LogPanel({
  height,
  searchVisible = false,
  onSearchClose,
}: {
  height: number;
  searchVisible?: boolean;
  onSearchClose?: () => void;
}): ReactNode {
  const { state, actions } = useApp();
  const logApi = state.api.log;
  const intervalMs = (state.config.metrics?.poll_interval_s ?? 5) * 1000;
  const query = state.searchQuery.logs ?? "";

  // liveTail = latest PAGE_SIZE lines, auto-refreshed on a timer
  const [liveTail, setLiveTail] = useState<string[]>([]);
  // olderBuffer = lines prepended via "load older", accumulated across pages
  const [olderBuffer, setOlderBuffer] = useState<string[]>([]);
  // cursor for the next "load older" fetch (comes from the latest fetch response)
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState<number | null>(null); // null = follow tail

  // Refs to read latest values inside stable callbacks without re-triggering effects
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingOlderRef = useRef(loadingOlder);
  loadingOlderRef.current = loadingOlder;
  const olderBufferLenRef = useRef(olderBuffer.length);
  olderBufferLenRef.current = olderBuffer.length;

  const allLines = [...olderBuffer, ...liveTail];
  const allLinesRef = useRef<string[]>([]);
  allLinesRef.current = allLines;

  // Fetch the latest page — replaces liveTail only; olderBuffer is untouched
  const fetchLatest = useCallback(async () => {
    setRefreshing(true);
    const result = await logApi.list(PAGE_SIZE);
    setRefreshing(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setLiveTail(result.data.logs ?? []);
    // Only update the pagination cursor when no older pages are loaded yet — once
    // the user starts paging back, the cursor tracks history, not the live boundary.
    if (olderBufferLenRef.current === 0) {
      setCursor(result.data.next_cursor);
      setHasMore(result.data.has_more);
    }
  }, [logApi]);

  // Mount + auto-refresh
  useEffect(() => {
    fetchLatest();
    const t = setInterval(fetchLatest, intervalMs);
    return () => clearInterval(t);
  }, [fetchLatest, intervalMs]);

  // Load one older page using the pagination cursor
  const loadOlder = useCallback(async () => {
    if (!hasMoreRef.current || loadingOlderRef.current || !cursorRef.current) return;
    setLoadingOlder(true);
    const result = await logApi.list(PAGE_SIZE, cursorRef.current);
    setLoadingOlder(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const older = result.data.logs ?? [];
    setOlderBuffer((prev) => [...older, ...prev]);
    setCursor(result.data.next_cursor);
    setHasMore(result.data.has_more);
    // Scroll to the top of the newly prepended content
    setScrollOffset(0);
  }, [logApi]);

  const searchBarHeight = searchVisible ? 3 : 0;
  const contentH = Math.max(1, height - 3 - searchBarHeight); // header + footer + paddingTop + searchBar
  const totalLines = allLines.length;

  // Apply search filter to visible lines
  const filteredLines = query ? allLines.filter((line) => matchesSearch(line, query)) : allLines;
  const filteredTotalLines = filteredLines.length;

  const viewOffset =
    scrollOffset === null ? Math.max(0, filteredTotalLines - contentH) : scrollOffset;
  const visible = filteredLines.slice(viewOffset, viewOffset + contentH);

  useKeyboard(
    useCallback(
      (key: { name: string }) => {
        if (state.activeTab !== "logs") return;
        const maxOffset = Math.max(0, filteredTotalLines - contentH);
        // Pagination
        if (key.name === "b") {
          void loadOlder();
          return;
        }
        if (key.name === "r") {
          setOlderBuffer([]);
          setScrollOffset(null);
          void fetchLatest();
          return;
        }
        // Scroll
        if (key.name === "G") {
          setScrollOffset(null);
          return;
        }
        if (key.name === "g") {
          setScrollOffset(0);
          return;
        }
        if (key.name === "up" || key.name === "k") {
          setScrollOffset((prev) => Math.max(0, (prev === null ? maxOffset : prev) - 1));
          return;
        }
        if (key.name === "down" || key.name === "j") {
          setScrollOffset((prev) => {
            const cur = prev === null ? maxOffset : prev;
            return cur + 1 >= maxOffset ? null : cur + 1;
          });
        }
      },
      [state.activeTab, contentH, filteredTotalLines, loadOlder, fetchLatest]
    )
  );

  // Footer hint bar
  const footerParts = ["[↑↓/jk] scroll", "[g] top", "[G] tail"];
  if (hasMore) footerParts.push("[b] older");
  if (olderBuffer.length > 0) footerParts.push("[r] reset");
  footerParts.push(
    `${filteredTotalLines}${query ? ` of ${totalLines}` : ""} lines${hasMore ? "+" : ""}`
  );

  return (
    <box style={{ width: "100%", height, flexDirection: "column", paddingLeft: 1, paddingTop: 1 }}>
      {searchVisible && onSearchClose && (
        <SearchBar
          query={query}
          onQueryChange={(q) => actions.setSearchQuery("logs", q)}
          onClose={onSearchClose}
          width={100}
          matchCount={filteredTotalLines}
          totalCount={totalLines}
        />
      )}
      <text fg={colors.fg.secondary}>
        Log Viewer
        {refreshing && <span fg={colors.status.warning}> [refreshing...]</span>}
        {loadingOlder && <span fg={colors.status.warning}> [loading older...]</span>}
        {!refreshing && !loadingOlder && scrollOffset === null && (
          <span fg={colors.status.success}> [follow]</span>
        )}
        {!refreshing && !loadingOlder && scrollOffset !== null && (
          <span fg={colors.fg.muted}> [scroll]</span>
        )}
        {error && <span fg={colors.status.error}> err: {error}</span>}
      </text>
      {visible.map((line, i) => {
        const lineNum = viewOffset + i + 1;
        const cls = classifyLogLine(line);
        const lineFg =
          cls === "error"
            ? colors.status.error
            : cls === "warn"
              ? colors.status.warning
              : colors.fg.primary;
        return (
          <box key={i} style={{ flexDirection: "row", paddingLeft: 1 }}>
            <text fg={colors.fg.muted} style={{ width: 5 }}>
              {String(lineNum).padStart(4, " ")}
            </text>
            <text fg={lineFg}>{line}</text>
          </box>
        );
      })}
      {totalLines === 0 && !refreshing && !error && (
        <text fg={colors.fg.muted}> No log lines available.</text>
      )}
      <text fg={colors.fg.muted}> {footerParts.join("  ")}</text>
    </box>
  );
}
