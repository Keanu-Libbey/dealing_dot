import { useEffect, useMemo, useRef, useState } from 'react';

import './App.css';
import { buildDealingDotLayout, useGame } from './hooks/useGame';
import {
  deleteSavedGame,
  deleteIncompleteGame,
  clearSeasonData,
  fetchGames,
  fetchIncompleteGames,
  fetchLeaderboard,
  fetchPlayers,
  saveGame,
  saveIncompleteGame,
} from './lib/gameService';
import {
  calcPoints,
  generateForcedBidSet,
  type Game,
  getTotals,
  getWinner,
  type Round,
} from './lib/scoring';
import type { IncompleteGameRecord, LeaderboardRow, Player, SavedGameRecord } from './types';

const DEFAULT_PLAYERS = [
  'Keanu',
  'Isabelle',
  'Jane',
  'Paul',
  'Dan',
  'Suzie',
  'Sean',
];
const HIGHEST_ROUND_OPTIONS = [6, 7, 8, 9] as const;

// passcode removed — saves no longer require a group passcode
const normalizePlayerName = (name: string) => name.trim().toLowerCase();

type SeasonExportRow = {
  table: string;
  recordId: string;
  payload: Record<string, unknown>;
};

const csvEscape = (value: string) => `"${value.replaceAll('"', '""')}"`;

const buildSeasonExportCsv = (rows: SeasonExportRow[]) => {
  const header = ['table', 'record_id', 'payload_json'].join(',');
  const lines = rows.map((row) => [
    csvEscape(row.table),
    csvEscape(row.recordId),
    csvEscape(JSON.stringify(row.payload)),
  ].join(','));

  return [header, ...lines].join('\n');
};

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

type Screen = 'home' | 'setup' | 'game' | 'summary' | 'history' | 'games' | 'data';

type DraftAction = {
  playerId: string;
  field: 'bid' | 'tricks';
  previousValue: number | null;
};

type HistoryDetailState = {
  title: string;
  dateIso: string;
  game: Game | null;
  scores: Array<{
    player_id: string;
    name: string;
    score: number;
  }>;
  unavailableMessage?: string;
};

function App() {
  const { game, startGame, addRound, undoLastRound, resetGame, loadGame } = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>(DEFAULT_PLAYERS);
  const [highestRound, setHighestRound] = useState<number>(7);
  const [draftBids, setDraftBids] = useState<Record<string, number>>({});
  const [draftTricks, setDraftTricks] = useState<Record<string, number>>({});
  const [players, setPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [games, setGames] = useState<SavedGameRecord[]>([]);
  // passcode state removed
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
  const [bidMenuCell, setBidMenuCell] = useState<string | null>(null);
  const [tricksInputCell, setTricksInputCell] = useState<string | null>(null);
  const [tricksInputValue, setTricksInputValue] = useState<string>('');
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [draftActions, setDraftActions] = useState<DraftAction[]>([]);
  const [finishConfirming, setFinishConfirming] = useState(false);
  const [incompleteGames, setIncompleteGames] = useState<IncompleteGameRecord[]>([]);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetailState | null>(null);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [clearDataConfirming, setClearDataConfirming] = useState(false);
  const [summaryRevealCount, setSummaryRevealCount] = useState(0);
  const [confirmDeleteGameId, setConfirmDeleteGameId] = useState<string | null>(null);
  const [isDeletingGameId, setIsDeletingGameId] = useState<string | null>(null);
  const pendingRestoreRoundRef = useRef<Round | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        const fetchedPlayers = await fetchPlayers();
        setPlayers(fetchedPlayers);

        if (fetchedPlayers.length > 0) {
          setSelectedPlayers(fetchedPlayers.map((player) => player.name));
        }
      } catch (error) {
        console.warn('Unable to load players from Supabase; using local defaults.', error);
        setPlayers([]);
      }
    };

    const loadLeaderboard = async () => {
      try {
        const rows = await fetchLeaderboard();
        setLeaderboard(rows);
      } catch (error) {
        console.warn('Unable to load leaderboard.', error);
        setLeaderboard([]);
      }
    };

    const loadGames = async () => {
      try {
        const rows = await fetchGames();
        setGames(rows);
      } catch (error) {
        console.warn('Unable to load games.', error);
        setGames([]);
      }
    };

    const loadIncomplete = async () => {
      try {
        const rows = await fetchIncompleteGames();
        setIncompleteGames(rows);
      } catch (error) {
        console.warn('Unable to load incomplete games.', error);
        setIncompleteGames([]);
      }
    };

    void loadPlayers();
    void loadLeaderboard();
    void loadGames();
    void loadIncomplete();
  }, []);

  // no passcode persistence

  const roundTemplates = useMemo(() => {
    if (!game) {
      return [];
    }

    return buildDealingDotLayout(game.playerIds.length, game.highestRound);
  }, [game]);

  const currentRoundIndex = game ? game.rounds.length : 0;
  const currentRoundTemplate =
    game && currentRoundIndex < roundTemplates.length ? roundTemplates[currentRoundIndex] : null;

  const totals = useMemo(() => {
    if (!game) {
      return {} as Record<string, number>;
    }

    return getTotals(game);
  }, [game]);

  const winner = useMemo(() => {
    if (!game || game.rounds.length === 0) {
      return null;
    }

    return getWinner(totals);
  }, [game, totals]);

  const playerIdByName = useMemo(() => {
    return Object.fromEntries(players.map((player) => [normalizePlayerName(player.name), player.id]));
  }, [players]);

  const playerNameById = useMemo(() => {
    return Object.fromEntries(players.map((player) => [player.id, player.name]));
  }, [players]);

  const orderedPlayerNames = useMemo(() => {
    return selectedPlayers.length > 0 ? selectedPlayers : DEFAULT_PLAYERS;
  }, [selectedPlayers]);

  useEffect(() => {
    if (!game) {
      setScreen((currentScreen) => (currentScreen === 'history' || currentScreen === 'games' || currentScreen === 'home' ? currentScreen : 'home'));
      return;
    }

    if (game.rounds.length >= roundTemplates.length) {
      setScreen('summary');
      return;
    }

    setScreen('game');
  }, [game, roundTemplates.length]);

  useEffect(() => {
    if (!game || !currentRoundTemplate) {
      return;
    }

    if (pendingRestoreRoundRef.current) {
      setDraftBids({ ...pendingRestoreRoundRef.current.bids });
      setDraftTricks({ ...pendingRestoreRoundRef.current.tricks });
      setDraftActions([]);
      pendingRestoreRoundRef.current = null;
      return;
    }

    const startingBids: Record<string, number> = {};
    const startingTricks: Record<string, number> = {};

    if (currentRoundTemplate.roundType === 'fbu' || currentRoundTemplate.roundType === 'fbo') {
      const forcedBids = generateForcedBidSet(
        game.playerIds,
        currentRoundTemplate.cardCount,
        currentRoundTemplate.roundType,
      );
      Object.assign(startingBids, forcedBids);
    }

    if (currentRoundTemplate.roundType === 'misery') {
      for (const playerId of game.playerIds) {
        startingBids[playerId] = 0;
      }
    }

    setDraftBids(startingBids);
    setDraftTricks(startingTricks);
    setDraftActions([]);
  }, [currentRoundTemplate, game]);

  useEffect(() => {
    if (!game) {
      setFinishConfirming(false);
    }
  }, [game]);

  useEffect(() => {
    if (!statusToast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStatusToast(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [statusToast]);

  useEffect(() => {
    if (screen === 'summary') {
      setSummaryRevealCount(0);
    }
  }, [screen, game?.startedAt]);

  const togglePlayer = (playerName: string) => {
    setSelectedPlayers((current) =>
      current.includes(playerName)
        ? current.filter((name) => name !== playerName)
        : [...current, playerName],
    );
  };

  const movePlayer = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    setSelectedPlayers((current) => {
      const updated = [...current];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const clampValue = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.max(min, Math.min(max, Math.trunc(value)));
  };

  const getCurrentRoundLimits = () => {
    if (!currentRoundTemplate) {
      return { bidMax: 0, trickMax: 0 };
    }

    const bidMax =
      currentRoundTemplate.roundType === 'normal' || currentRoundTemplate.roundType === 'nt'
        ? currentRoundTemplate.cardCount
        : 3;

    return {
      bidMax,
      trickMax: currentRoundTemplate.cardCount,
    };
  };

  const parseCellKey = (cellKey: string) => {
    const lastDashIndex = cellKey.lastIndexOf('-');
    const playerId = cellKey.slice(0, lastDashIndex);
    const roundIndex = Number(cellKey.slice(lastDashIndex + 1));

    return { playerId, roundIndex };
  };

  const getCellKey = (playerId: string, roundIndex: number) => `${playerId}-${roundIndex}`;

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleBidSelect = (cellKey: string, bid: number) => {
    const { playerId } = parseCellKey(cellKey);
    const maxBid = getCurrentRoundLimits().bidMax;

    const nextBid = clampValue(bid, 0, maxBid);

    setDraftBids((current) => ({
      ...current,
      [playerId]: nextBid,
    }));
    setDraftActions((current) => [
      ...current,
      {
        playerId,
        field: 'bid',
        previousValue: draftBids[playerId] ?? null,
      },
    ]);

    setActiveCell(cellKey);
    setBidMenuCell(null);
  };

  const getAllowedBidOptions = (cellKey: string): number[] => {
    if (!game || !currentRoundTemplate) {
      return [];
    }

    const { playerId, roundIndex } = parseCellKey(cellKey);
    if (roundIndex !== currentRoundIndex) {
      return [];
    }

    const { bidMax } = getCurrentRoundLimits();
    const options = Array.from({ length: bidMax + 1 }, (_, index) => index);
    const dealerPlayerId = game.playerIds[currentRoundTemplate.dealerIndex];
    const isDealerCell = playerId === dealerPlayerId;

    if (!isDealerCell) {
      return options;
    }

    const otherPlayerIds = game.playerIds.filter((id) => id !== playerId);
    const allOtherBidsEntered = otherPlayerIds.every((id) => (draftBids[id] ?? null) !== null);

    if (!allOtherBidsEntered) {
      return options;
    }

    const otherBidsTotal = otherPlayerIds.reduce((sum, id) => sum + (draftBids[id] ?? 0), 0);
    return options.filter((option) => otherBidsTotal + option !== currentRoundTemplate.cardCount);
  };

  const handleTricksSubmit = (cellKey: string, result: number) => {
    const { playerId } = parseCellKey(cellKey);
    const { trickMax } = getCurrentRoundLimits();
    const nextTricks = clampValue(result, 0, trickMax);

    setDraftTricks((current) => ({
      ...current,
      [playerId]: nextTricks,
    }));
    setDraftActions((current) => [
      ...current,
      {
        playerId,
        field: 'tricks',
        previousValue: draftTricks[playerId] ?? null,
      },
    ]);
    setActiveCell(cellKey);
    setTricksInputCell(null);
    setTricksInputValue('');
  };

  const handleCellTap = (playerId: string, roundIndex: number) => {
    if (!currentRoundTemplate) {
      return;
    }

    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    const cellKey = getCellKey(playerId, roundIndex);
    const bid = draftBids[playerId] ?? null;
    const tricks = draftTricks[playerId] ?? null;

    setActiveCell(cellKey);

    if (bid === null && tricks === null) {
      setBidMenuCell(cellKey);
      return;
    }

    setTricksInputCell(cellKey);
    setTricksInputValue(tricks !== null ? String(tricks) : '');
  };

  const handleCellDoubleClick = (playerId: string, roundIndex: number) => {
    if (!currentRoundTemplate) {
      return;
    }

    const bid = draftBids[playerId] ?? null;
    if (bid === null) {
      setBidMenuCell(getCellKey(playerId, roundIndex));
      return;
    }

    const autoWin = currentRoundTemplate.roundType === 'misery' ? 0 : bid + 10;
    setDraftTricks((current) => ({
      ...current,
      [playerId]: autoWin,
    }));
    setDraftActions((current) => [
      ...current,
      {
        playerId,
        field: 'tricks',
        previousValue: draftTricks[playerId] ?? null,
      },
    ]);
    setActiveCell(getCellKey(playerId, roundIndex));
    setBidMenuCell(null);
    setTricksInputCell(null);
    setTricksInputValue('');
  };

  const handleCellLongPressStart = (playerId: string, roundIndex: number) => {
    if (!currentRoundTemplate) {
      return;
    }

    const bid = draftBids[playerId] ?? null;
    if (bid === null) {
      return;
    }

    clearLongPressTimer();
    longPressTimer.current = window.setTimeout(() => {
      const autoWin = currentRoundTemplate.roundType === 'misery' ? 0 : (bid ?? 0) + 10;
      setDraftTricks((current) => ({
        ...current,
        [playerId]: autoWin,
      }));
      setDraftActions((current) => [
        ...current,
        {
          playerId,
          field: 'tricks',
          previousValue: draftTricks[playerId] ?? null,
        },
      ]);
      longPressTriggeredRef.current = true;
      setActiveCell(getCellKey(playerId, roundIndex));
      setBidMenuCell(null);
      setTricksInputCell(null);
      setTricksInputValue('');
      clearLongPressTimer();
    }, 500);
  };

  const handleCellLongPressEnd = () => {
    clearLongPressTimer();
  };

  const isValidUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const resolvePlayerId = (value: string): string => {
    if (isValidUuid(value)) {
      return value;
    }

    const match = players.find((player) => normalizePlayerName(player.name) === normalizePlayerName(value));
    return match?.id ?? value;
  };

  const handleStartGame = () => {
    if (selectedPlayers.length === 0) {
      setStartError('Select at least one player to start a game.');
      return;
    }

    const resolvedIds = orderedPlayerNames.flatMap((playerName) => {
      const mappedId = playerIdByName[normalizePlayerName(playerName)];
      if (mappedId) {
        return [mappedId];
      }

      return [playerName];
    });

    if (resolvedIds.length === 0) {
      setStartError('No valid players were selected.');
      return;
    }

    setStartError(null);
    startGame(resolvedIds, highestRound);
    setFinishConfirming(false);
    setScreen('game');
  };

  const handleUndoLastAction = () => {
    if (!game) {
      return;
    }

    if (draftActions.length > 0) {
      const lastAction = draftActions[draftActions.length - 1];
      setDraftActions((current) => current.slice(0, -1));

      if (lastAction.field === 'bid') {
        setDraftBids((current) => {
          const next = { ...current };
          if (lastAction.previousValue === null) {
            delete next[lastAction.playerId];
          } else {
            next[lastAction.playerId] = lastAction.previousValue;
          }
          return next;
        });
      } else {
        setDraftTricks((current) => {
          const next = { ...current };
          if (lastAction.previousValue === null) {
            delete next[lastAction.playerId];
          } else {
            next[lastAction.playerId] = lastAction.previousValue;
          }
          return next;
        });
      }

      setActiveCell(getCellKey(lastAction.playerId, currentRoundIndex));
      return;
    }

    if (game.rounds.length === 0) {
      return;
    }

    const previousRound = game.rounds[game.rounds.length - 1];
    pendingRestoreRoundRef.current = previousRound;
    undoLastRound();
    setFinishConfirming(false);
  };

  const handleConfirmRound = () => {
    if (!game || !currentRoundTemplate) {
      return;
    }

    const completedBids = { ...draftBids };
    const completedTricks = { ...draftTricks };

    for (const playerId of game.playerIds) {
      const bid = completedBids[playerId] ?? null;
      const tricks = completedTricks[playerId] ?? null;

      if (tricks === null && bid !== null) {
        completedTricks[playerId] = currentRoundTemplate.roundType === 'misery' ? 0 : bid;
      }
    }

    const round: Round = {
      cardCount: currentRoundTemplate.cardCount,
      roundType: currentRoundTemplate.roundType,
      bids: completedBids,
      tricks: completedTricks,
    };

    addRound(round);
    setDraftActions([]);
  };

  const handleSaveForLater = () => {
    if (!game || isSavingDraft) {
      return;
    }

    void (async () => {
      setIsSavingDraft(true);
      setSaveError(null);

      try {
        await saveIncompleteGame(game);
        const rows = await fetchIncompleteGames();
        setIncompleteGames(rows);
        resetGame();
        setFinishConfirming(false);
        setStatusToast('Game saved for later. Resume from Game history.');
        setScreen('home');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to save the game for later.';
        setSaveError(message);
      } finally {
        setIsSavingDraft(false);
      }
    })();
  };

  const handleResumeIncompleteGame = (recordId: string) => {
    const record = incompleteGames.find((item) => item.id === recordId);
    if (!record) {
      return;
    }

    loadGame(record.game);
    setSaveError(null);
    setFinishConfirming(false);
    setScreen('game');
  };

  const handleFinishGameClick = () => {
    if (!finishConfirming) {
      setFinishConfirming(true);
      return;
    }

    void handleSaveGame();
  };

  const handleSaveGame = async () => {
    if (!game) {
      return;
    }
    const resolvedPlayerIds = game.playerIds.map(resolvePlayerId);

    const playerScores = game.playerIds.map((playerId, index) => ({
      player_id: resolvedPlayerIds[index],
      score: totals[playerId] ?? 0,
    }));
    setIsSaving(true);
    setSaveError(null);

    try {
      await saveGame(new Date().toISOString(), playerScores, game);
      try {
        await deleteIncompleteGame(game.startedAt);
      } catch (error) {
        console.warn('Completed game saved, but draft cleanup failed.', error);
      }
      resetGame();
      setScreen('home');
      const rows = await fetchLeaderboard();
      setLeaderboard(rows);
      const gameRows = await fetchGames();
      setGames(gameRows);
      const incompleteRows = await fetchIncompleteGames();
      setIncompleteGames(incompleteRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the game.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    setIsExportingData(true);
    setSaveError(null);

    try {
      const [allPlayers, allGames, allIncompleteGames, allLeaderboard] = await Promise.all([
        fetchPlayers(),
        fetchGames(),
        fetchIncompleteGames(),
        fetchLeaderboard(),
      ]);

      const exportRows: SeasonExportRow[] = [];

      allPlayers.forEach((player) => {
        exportRows.push({
          table: 'players',
          recordId: player.id,
          payload: { id: player.id, name: player.name },
        });
      });

      allGames.forEach((savedGame) => {
        exportRows.push({
          table: 'games',
          recordId: savedGame.id,
          payload: {
            id: savedGame.id,
            played_at: savedGame.played_at,
          },
        });

        savedGame.scores.forEach((score) => {
          exportRows.push({
            table: 'results',
            recordId: `${savedGame.id}:${score.player_id}`,
            payload: {
              game_id: savedGame.id,
              player_id: score.player_id,
              player_name: score.name,
              score: score.score,
            },
          });
        });

        if (savedGame.game) {
          exportRows.push({
            table: 'game_snapshots',
            recordId: savedGame.id,
            payload: {
              game_id: savedGame.id,
              played_at: savedGame.played_at,
              game: savedGame.game,
            },
          });
        }
      });

      allIncompleteGames.forEach((record) => {
        exportRows.push({
          table: 'incomplete_games',
          recordId: record.id,
          payload: {
            id: record.id,
            saved_at: record.saved_at,
            game: record.game,
          },
        });
      });

      allLeaderboard.forEach((row) => {
        exportRows.push({
          table: 'leaderboard',
          recordId: row.name,
          payload: row,
        });
      });

      const csv = buildSeasonExportCsv(exportRows);
      const filename = `nomo-season-backup-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadTextFile(filename, csv);
      setStatusToast('Season data exported.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export season data.';
      setSaveError(message);
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteSeasonData = async () => {
    if (!clearDataConfirming) {
      setClearDataConfirming(true);
      return;
    }

    setIsClearingData(true);
    setSaveError(null);

    try {
      await clearSeasonData();
      setPlayers([]);
      setLeaderboard([]);
      setGames([]);
      setIncompleteGames([]);
      setSelectedPlayers(DEFAULT_PLAYERS);
      setHistoryDetail(null);
      setClearDataConfirming(false);
      setStatusToast('Season data cleared.');
      resetGame();
      setScreen('home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to clear season data.';
      setSaveError(message);
    } finally {
      setIsClearingData(false);
    }
  };

  const handleDeleteHistoryGame = async (gameId: string, status: 'complete' | 'incomplete') => {
    const confirmKey = `${status}:${gameId}`;
    if (confirmDeleteGameId !== confirmKey) {
      setConfirmDeleteGameId(confirmKey);
      return;
    }

    setIsDeletingGameId(confirmKey);
    setSaveError(null);

    try {
      if (status === 'incomplete') {
        await deleteIncompleteGame(gameId);
      } else {
        await deleteSavedGame(gameId);
      }

      const [gameRows, incompleteRows, leaderboardRows] = await Promise.all([
        fetchGames(),
        fetchIncompleteGames(),
        fetchLeaderboard(),
      ]);

      setGames(gameRows);
      setIncompleteGames(incompleteRows);
      setLeaderboard(leaderboardRows);
      setStatusToast('Game deleted.');
      setConfirmDeleteGameId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete game.';
      setSaveError(message);
    } finally {
      setIsDeletingGameId(null);
    }
  };

  const renderSetup = () => (
    <main className="app-shell setup-screen">
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <p className="eyebrow">Nomo scorer</p>
            <h1>New game</h1>
          </div>
          <button type="button" className="secondary-button" onClick={() => setScreen('home')}>
            Back
          </button>
        </div>

        <div className="field-block">
          <label>Highest round</label>
          <div className="option-pills" role="group" aria-label="Highest round selection">
            {HIGHEST_ROUND_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={option === highestRound ? 'option-pill active' : 'option-pill'}
                onClick={() => setHighestRound(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="field-block">
          <label>Players in this game (drag or tap to reorder)</label>
          <div className="player-list vertical">
            {orderedPlayerNames.map((playerName, index) => (
              <div
                key={playerName}
                draggable
                onDragStart={() => setDraggedPlayer(playerName)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggedPlayer) {
                    return;
                  }

                  const fromIndex = orderedPlayerNames.indexOf(draggedPlayer);
                  const toIndex = orderedPlayerNames.indexOf(playerName);
                  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
                    movePlayer(fromIndex, toIndex);
                  }
                }}
                className={`player-chip selected ${draggedPlayer === playerName ? 'dragging' : ''}`}
              >
                <span className="player-order-index">{index + 1}</span>
                <button
                  type="button"
                  className="player-select-button"
                  onClick={() => togglePlayer(playerName)}
                >
                  {playerName}
                </button>
                <div className="player-order-actions" aria-label={`Move ${playerName}`}>
                  <button type="button" onClick={() => movePlayer(index, Math.max(0, index - 1))} aria-label={`Move ${playerName} up`}>
                    ↑
                  </button>
                  <button type="button" onClick={() => movePlayer(index, Math.min(orderedPlayerNames.length - 1, index + 1))} aria-label={`Move ${playerName} down`}>
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>

          {DEFAULT_PLAYERS.length > orderedPlayerNames.length && (
            <div className="unselected-players">
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '8px' }}>Click to add player:</p>
              <div className="player-list">
                {DEFAULT_PLAYERS.filter((name) => !orderedPlayerNames.includes(name)).map(
                  (playerName) => (
                    <button
                      key={playerName}
                      type="button"
                      className="player-chip add-button"
                      onClick={() => togglePlayer(playerName)}
                    >
                      + {playerName}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        {startError ? <p className="save-error">{startError}</p> : null}

        <button type="button" className="primary-button" onClick={handleStartGame}>
          Start game
        </button>
      </div>
    </main>
  );

  const renderGame = () => {
    if (!game || !currentRoundTemplate) {
      return null;
    }

    return (
      <main className="app-shell round-entry-screen">
        <div className="panel round-panel">
          <div className="scoreboard-head">
            <div>
              <p className="eyebrow">Round {game.rounds.length + 1}</p>
              <h1>
                {currentRoundTemplate.cardCount}{' '}
                {currentRoundTemplate.roundType.toUpperCase()}
              </h1>
            </div>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={handleUndoLastAction}>
                Undo last
              </button>
              <button type="button" className="secondary-button" onClick={handleSaveForLater} disabled={isSavingDraft}>
                {isSavingDraft ? 'Saving draft...' : 'Save for later'}
              </button>
              <button type="button" className="secondary-button" onClick={handleFinishGameClick} disabled={isSaving}>
                {isSaving ? 'Saving...' : finishConfirming ? 'Sure?' : 'Finish game'}
              </button>
            </div>
          </div>

          <div className="score-table">
            <div className="score-table-header" style={{ gridTemplateColumns: `120px repeat(${game.playerIds.length}, minmax(90px, 1fr))` }}>
              <div className="score-table-corner">Round</div>
              {game.playerIds.map((playerId) => (
                <div key={playerId} className="score-table-header-cell">
                  {playerNameById[playerId] ?? playerId}
                </div>
              ))}
            </div>

            {roundTemplates.map((row, index) => {
              const previousRound = game.rounds[index];
              const isCurrentRound = index === currentRoundIndex;
              const dealerIndex = row.dealerIndex;
              const labelText = row.roundType === 'normal' ? '' : row.roundType.toUpperCase();

              return (
                <div
                  key={`${row.cardCount}-${row.roundType}-${index}`}
                  className={isCurrentRound ? 'score-table-row active' : 'score-table-row'}
                  style={{ gridTemplateColumns: `120px repeat(${game.playerIds.length}, minmax(90px, 1fr))` }}
                >
                  <div
                    className={isCurrentRound ? 'score-table-label round-confirm-label current-round-label' : 'score-table-label round-confirm-label'}
                    onDoubleClick={() => isCurrentRound && handleConfirmRound()}
                  >
                    <span>{row.cardCount}</span>
                    {labelText ? <small>{labelText}</small> : null}
                  </div>

                  {game.playerIds.map((playerId, playerColumnIndex) => {
                    let bid = previousRound?.bids[playerId] ?? null;
                    let tricks = previousRound?.tricks[playerId] ?? null;

                    if (isCurrentRound) {
                      bid = draftBids[playerId] ?? null;
                      tricks = draftTricks[playerId] ?? null;
                    }

                    const points = previousRound ? calcPoints(bid ?? 0, tricks ?? 0, row.roundType) : 0;
                    const isDealerCell = playerColumnIndex === dealerIndex;
                    const cellKey = getCellKey(playerId, index);
                    const isActiveCell = activeCell === cellKey;

                    let displayValue: string;
                    if (isCurrentRound) {
                      if (currentRoundTemplate.roundType === 'misery') {
                        if (tricks === null) {
                          displayValue = '.';
                        } else if (tricks === 0) {
                          displayValue = '0';
                        } else {
                          displayValue = String(calcPoints(0, tricks, 'misery'));
                        }
                      } else if (bid === null && tricks === null) {
                        displayValue = '.';
                      } else if (bid !== null && tricks === null) {
                        displayValue = `${bid}-.`;
                      } else if (bid !== null && tricks !== null) {
                        displayValue = `${bid}-${tricks}`;
                      } else {
                        displayValue = '.';
                      }
                    } else if (previousRound?.roundType === 'misery') {
                      const points = calcPoints(0, tricks ?? 0, 'misery');
                      displayValue = points === 0 ? '0' : String(points);
                    } else if (previousRound) {
                      displayValue = `${bid ?? 0}-${points}`;
                    } else {
                      displayValue = '.';
                    }

                    return (
                      <div
                        key={cellKey}
                        className={`score-table-cell ${isDealerCell ? 'dealer-highlight' : ''} ${isActiveCell ? 'cell-selected' : ''}`}
                        onTouchStart={() => isCurrentRound && handleCellLongPressStart(playerId, index)}
                        onTouchEnd={handleCellLongPressEnd}
                        onMouseDown={() => isCurrentRound && handleCellLongPressStart(playerId, index)}
                        onMouseUp={handleCellLongPressEnd}
                        onClick={() => isCurrentRound && handleCellTap(playerId, index)}
                        onDoubleClick={() => isCurrentRound && handleCellDoubleClick(playerId, index)}
                      >
                        {previousRound || (bid !== null && tricks !== null) || (bid !== null && tricks === null) ? (
                          <strong>{displayValue}</strong>
                        ) : (
                          <span>{displayValue}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

        </div>

        {bidMenuCell && currentRoundTemplate && (
          <div className="cell-modal-overlay" onClick={() => setBidMenuCell(null)}>
            <div className="cell-modal" onClick={(e) => e.stopPropagation()}>
              <p className="cell-modal-title">Select bid (0–{currentRoundTemplate.cardCount})</p>
              <div className="bid-menu">
                {getAllowedBidOptions(bidMenuCell).map(
                  (bidOption) => (
                    <button
                      key={bidOption}
                      type="button"
                      className="bid-option"
                      onClick={() => handleBidSelect(bidMenuCell, bidOption)}
                    >
                      {bidOption}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        )}

        {tricksInputCell && currentRoundTemplate && (
          <div className="cell-modal-overlay" onClick={() => setTricksInputCell(null)}>
            <div className="cell-modal tricks-modal" onClick={(e) => e.stopPropagation()}>
              <p className="cell-modal-title">Enter tricks won (0–{currentRoundTemplate.cardCount})</p>
              <div className="tricks-input-group">
                <input
                  type="number"
                  min={0}
                  max={currentRoundTemplate.cardCount}
                  inputMode="numeric"
                  value={tricksInputValue}
                  onChange={(e) => setTricksInputValue(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    const val = Number.parseInt(tricksInputValue, 10);
                    if (Number.isFinite(val)) {
                      handleTricksSubmit(tricksInputCell, val);
                    }
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  };

  const renderSummary = () => {
    if (!game) {
      return null;
    }

    const rankedPlayers = [...game.playerIds]
      .map((playerId) => ({
        playerId,
        name: playerNameById[playerId] ?? playerId,
        score: totals[playerId] ?? 0,
      }))
      .sort((a, b) => b.score - a.score);

    const topThree = rankedPlayers.slice(0, 3);
    const remainingPlayers = rankedPlayers.slice(3);

    const podiumByPosition = {
      first: topThree[0] ?? null,
      second: topThree[1] ?? null,
      third: topThree[2] ?? null,
    };

    const getRevealLabel = (index: number, entry: { name: string; score: number } | null) => {
      if (!entry) {
        return '-';
      }

      if (index >= totalPlacements - summaryRevealCount) {
        return `${entry.name} • ${entry.score}`;
      }

      return 'Tap reveal';
    };

    const totalPlacements = rankedPlayers.length;
    const allRevealed = summaryRevealCount >= totalPlacements;

    return (
      <main className="app-shell scoreboard-screen">
        <div className="panel scoreboard-panel">
          <div className="scoreboard-head">
            <div>
              <p className="eyebrow">Game complete</p>
              <h1>Final score</h1>
            </div>
            <button type="button" className="secondary-button" onClick={() => resetGame()}>
              Discard
            </button>
          </div>

          <div className="summary-row">
            <span>Players: {game.playerIds.length}</span>
            <span>Highest round: {game.highestRound}</span>
            <span>Rounds: {game.rounds.length}</span>
          </div>

          <div className="reveal-controls">
            <button
              type="button"
              className="primary-button"
              onClick={() => setSummaryRevealCount((current) => Math.min(totalPlacements, current + 1))}
              disabled={allRevealed}
            >
              {allRevealed ? 'All players revealed' : 'Tap to reveal player'}
            </button>
          </div>

          <div className="podium-wrap">
            <div className="podium-slot second">
              <p>2nd</p>
              <div className="podium-card">{getRevealLabel(1, podiumByPosition.second)}</div>
            </div>
            <div className="podium-slot first">
              <p>1st</p>
              <div className="podium-card">{getRevealLabel(0, podiumByPosition.first)}</div>
            </div>
            <div className="podium-slot third">
              <p>3rd</p>
              <div className="podium-card">{getRevealLabel(2, podiumByPosition.third)}</div>
            </div>
          </div>

          {remainingPlayers.length > 0 ? (
            <div className="placement-list">
              {remainingPlayers.map((entry, index) => {
                const absoluteIndex = index + 3;
                return (
                  <div key={entry.playerId} className="placement-row">
                    <span>{absoluteIndex + 1}th</span>
                    <strong>{getRevealLabel(absoluteIndex, entry)}</strong>
                  </div>
                );
              })}
            </div>
          ) : null}

          {winner && (0 >= totalPlacements - summaryRevealCount) ? <p className="winner-banner">Winner: {playerNameById[winner] ?? winner}</p> : null}

          <div className="save-box">
            {saveError ? <p className="save-error">{saveError}</p> : null}
            <button type="button" className="primary-button" onClick={() => void handleSaveGame()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save game'}
            </button>
          </div>
        </div>
      </main>
    );
  };

  const renderHome = () => (
    <main className="app-shell home-screen">
      <div className="panel">
        {statusToast ? <p className="status-toast">{statusToast}</p> : null}
        <p className="eyebrow">Nomo scorer</p>
        <h1>Home</h1>

        <div className="home-buttons">
          <button
            type="button"
            className="primary-button"
            onClick={() => setScreen('setup')}
          >
            + New game
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setScreen('history')}
          >
            View leaderboard
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setScreen('games')}
          >
            View game history
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setScreen('data')}
          >
            Manage data
          </button>
        </div>
      </div>
    </main>
  );

  const renderDataManagement = () => (
    <main className="app-shell data-screen">
      <div className="panel">
        {statusToast ? <p className="status-toast">{statusToast}</p> : null}
        <div className="scoreboard-head">
          <div>
            <p className="eyebrow">Season data</p>
            <h1>Manage data</h1>
          </div>
          <button type="button" className="secondary-button" onClick={() => setScreen('home')}>
            Home
          </button>
        </div>

        <div className="summary-row">
          <span>Players: {players.length}</span>
          <span>Games: {games.length}</span>
          <span>Drafts: {incompleteGames.length}</span>
          <span>Saved snapshots: {games.filter((savedGame) => Boolean(savedGame.game)).length}</span>
        </div>

        <div className="data-actions">
          <button type="button" className="primary-button" onClick={() => void handleExportData()} disabled={isExportingData || isClearingData}>
            {isExportingData ? 'Exporting...' : 'Export data'}
          </button>

          <div className="data-danger-zone">
            <p>
              Delete all season data from the database after you have exported it. This clears players,
              games, results, saved drafts, and score-sheet snapshots.
            </p>
            {saveError ? <p className="save-error">{saveError}</p> : null}
            <button
              type="button"
              className="secondary-button danger-button"
              onClick={() => void handleDeleteSeasonData()}
              disabled={isClearingData || isExportingData}
            >
              {isClearingData ? (clearDataConfirming ? 'Clearing...' : 'Preparing...') : clearDataConfirming ? 'Confirm delete' : 'Delete data'}
            </button>
            {clearDataConfirming ? (
              <p className="empty-state">Press again to permanently clear the current season from Supabase.</p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );

  const renderGameHistory = () => {
    const completeRows = games.map((savedGame) => {
      const winner = savedGame.scores.length > 0
        ? savedGame.scores.reduce((max, curr) => (curr.score > max.score ? curr : max))
        : null;

      return {
        id: savedGame.id,
        dateIso: savedGame.played_at,
        winner: winner ? winner.name : '-',
        status: 'complete' as const,
        game: savedGame.game ?? null,
        scores: savedGame.scores,
      };
    });

    const incompleteRows = incompleteGames.map((record) => {
      const recordTotals = getTotals(record.game);
      const recordWinnerId = getWinner(recordTotals);

      return {
        id: record.id,
        dateIso: record.saved_at,
        winner: recordWinnerId ? (playerNameById[recordWinnerId] ?? recordWinnerId) : 'Incomplete',
        status: 'incomplete' as const,
        game: record.game,
        scores: record.game.playerIds.map((playerId) => ({
          player_id: playerId,
          name: playerNameById[playerId] ?? playerId,
          score: recordTotals[playerId] ?? 0,
        })),
      };
    });

    const mergedRows = [...completeRows, ...incompleteRows].sort(
      (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime(),
    );

    return (
      <main className="app-shell games-screen">
        <div className="panel">
          <div className="scoreboard-head">
            <div>
              <p className="eyebrow">Games</p>
              <h1>Game history</h1>
            </div>
            <button type="button" className="secondary-button" onClick={() => setScreen('home')}>
              Home
            </button>
          </div>

          <div className="games-list">
            {mergedRows.length === 0 ? (
              <p className="empty-state">No games saved yet.</p>
            ) : (
              <>
                <div className="games-table-head">
                  <span>Game #</span>
                  <span>Winner</span>
                  <span>Date</span>
                  <span>Actions</span>
                </div>
                {mergedRows.map((row, index) => {
                  const gameDate = new Date(row.dateIso);
                  const dateStr = gameDate.toLocaleDateString('en-GB');
                  const timeStr = gameDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  const gameNumber = mergedRows.length - index;

                  return (
                    <div key={row.id} className="game-row compact">
                      <div className="game-info">
                        <div><strong>{gameNumber}</strong></div>
                        <div className="game-winner">
                          {row.status === 'incomplete' ? (
                            'Incomplete'
                          ) : (
                            row.winner
                          )}
                        </div>
                        <div className="game-date">{dateStr} {timeStr}</div>
                        <div className="game-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setHistoryDetail({
                              title: `Game #${gameNumber}`,
                              dateIso: row.dateIso,
                              game: row.game,
                              scores: row.scores,
                              unavailableMessage:
                                row.game
                                  ? undefined
                                  : 'Detailed scoresheet is unavailable for this older game because it was saved before snapshot history was enabled.',
                            })}
                          >
                            View
                          </button>
                          {row.status === 'incomplete' ? (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => handleResumeIncompleteGame(row.id)}
                            >
                              Resume
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void handleDeleteHistoryGame(row.id, row.status)}
                            disabled={isDeletingGameId === `${row.status}:${row.id}`}
                          >
                            {isDeletingGameId === `${row.status}:${row.id}`
                              ? 'Deleting...'
                              : confirmDeleteGameId === `${row.status}:${row.id}`
                                ? 'Confirm delete'
                                : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {historyDetail ? renderHistoryDetailModal(historyDetail) : null}
        </div>
      </main>
    );
  };

  const renderHistoryDetailModal = (detail: HistoryDetailState) => {
    const detailDate = new Date(detail.dateIso);
    const dateLabel = `${detailDate.toLocaleDateString('en-GB')} ${detailDate.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    const detailGame = detail.game;
    const detailTotals = detailGame ? getTotals(detailGame) : null;
    const detailRounds = detailGame
      ? buildDealingDotLayout(detailGame.playerIds.length, detailGame.highestRound)
      : [];

    return (
      <div className="cell-modal-overlay" onClick={() => setHistoryDetail(null)}>
        <div className="cell-modal history-detail-modal" onClick={(e) => e.stopPropagation()}>
          <div className="scoreboard-head">
            <div>
              <p className="eyebrow">History</p>
              <h2>{detail.title}</h2>
              <p className="history-detail-date">{dateLabel}</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setHistoryDetail(null)}>
              Close
            </button>
          </div>

          {detail.unavailableMessage ? <p className="empty-state">{detail.unavailableMessage}</p> : null}

          {detailGame ? (
            <div className="history-score-table-wrap">
              <div className="score-table history-score-table">
                <div className="score-table-header" style={{ gridTemplateColumns: `90px repeat(${detailGame.playerIds.length}, minmax(78px, 1fr))` }}>
                  <div className="score-table-corner">Round</div>
                  {detailGame.playerIds.map((playerId) => (
                    <div key={playerId} className="score-table-header-cell">
                      {playerNameById[playerId] ?? playerId}
                    </div>
                  ))}
                </div>

                {detailRounds.map((row, index) => {
                  const playedRound = detailGame.rounds[index] ?? null;
                  const labelText = row.roundType === 'normal' ? '' : row.roundType.toUpperCase();

                  return (
                    <div
                      key={`${row.cardCount}-${row.roundType}-${index}-history`}
                      className="score-table-row"
                      style={{ gridTemplateColumns: `90px repeat(${detailGame.playerIds.length}, minmax(78px, 1fr))` }}
                    >
                      <div className="score-table-label">
                        <span>{row.cardCount}</span>
                        {labelText ? <small>{labelText}</small> : null}
                      </div>

                      {detailGame.playerIds.map((playerId, playerColumnIndex) => {
                        const bid = playedRound?.bids[playerId] ?? null;
                        const tricks = playedRound?.tricks[playerId] ?? null;
                        const isDealerCell = playerColumnIndex === row.dealerIndex;
                        const displayValue = playedRound?.roundType === 'misery'
                          ? (tricks === null ? '.' : (calcPoints(0, tricks, 'misery') === 0 ? '0' : String(calcPoints(0, tricks, 'misery'))))
                          : (bid !== null && tricks !== null ? `${bid}-${tricks}` : '.');

                        return (
                          <div
                            key={`${playerId}-${index}-history-cell`}
                            className={`score-table-cell ${isDealerCell ? 'dealer-highlight' : ''}`}
                          >
                            {bid !== null && tricks !== null ? <strong>{displayValue}</strong> : <span>{displayValue}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="history-totals">
            <h3>Totals</h3>
            <div className="score-grid history-total-grid">
              {detail.scores.map((score) => (
                <div key={score.player_id} className="score-card">
                  <h2>{score.name}</h2>
                  <strong>{detailTotals?.[score.player_id] ?? score.score}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <main className="app-shell history-screen">
      <div className="panel">
        <div className="scoreboard-head">
          <div>
            <p className="eyebrow">League</p>
            <h1>Leaderboard</h1>
          </div>
          <button type="button" className="secondary-button" onClick={() => setScreen('home')}>
            Home
          </button>
        </div>

        <div className="leaderboard-list">
          {leaderboard.length === 0 ? (
            <p className="empty-state">No games saved yet.</p>
          ) : (
            leaderboard.map((row, index) => (
              <div key={`${row.name}-${index}`} className="leaderboard-row">
                <div className="leaderboard-player">
                  <span>{index + 1}. {row.name}</span>
                  <span className="game-count">{row.games} {row.games === 1 ? 'game' : 'games'}</span>
                </div>
                <strong>{row.avg_score.toFixed(2)}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );

  if (screen === 'home') {
    return renderHome();
  }

  if (screen === 'setup') {
    return renderSetup();
  }

  if (screen === 'game') {
    return renderGame();
  }

  if (screen === 'summary') {
    return renderSummary();
  }

  if (screen === 'games') {
    return renderGameHistory();
  }

  if (screen === 'data') {
    return renderDataManagement();
  }

  return renderHistory();
}

export default App;
