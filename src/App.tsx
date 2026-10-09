import { useEffect, useMemo, useRef, useState } from 'react';

import './App.css';
import { buildDealingDotLayout, useGame } from './hooks/useGame';
import { fetchGames, fetchLeaderboard, fetchPlayers, saveGame } from './lib/gameService';
import {
  calcPoints,
  generateForcedBidSet,
  getTotals,
  getWinner,
  type Round,
} from './lib/scoring';
import type { LeaderboardRow, Player, SavedGameRecord } from './types';

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

type Screen = 'home' | 'setup' | 'game' | 'summary' | 'history' | 'games';

function App() {
  const { game, startGame, addRound, undoLastRound, resetGame } = useGame();
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

    void loadPlayers();
    void loadLeaderboard();
    void loadGames();
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

    const startingBids: Record<string, number> = {};
    const startingTricks: Record<string, number> = {};

    for (const playerId of game.playerIds) {
      startingTricks[playerId] = 0;
      startingBids[playerId] = 0;
    }

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
  }, [currentRoundTemplate, game]);

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

  const getCellKey = (playerId: string, roundIndex: number) => `${playerId}-${roundIndex}`;

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleBidSelect = (cellKey: string, bid: number) => {
    const [playerId] = cellKey.split('-');
    const maxBid = getCurrentRoundLimits().bidMax;

    setDraftBids((current) => ({
      ...current,
      [playerId]: clampValue(bid, 0, maxBid),
    }));
    setBidMenuCell(null);
  };

  const handleTricksSubmit = (cellKey: string, result: number) => {
    const [playerId] = cellKey.split('-');
    const { trickMax } = getCurrentRoundLimits();
    const nextTricks = clampValue(result, 0, trickMax);

    setDraftTricks((current) => ({
      ...current,
      [playerId]: nextTricks,
    }));
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
    const bid = draftBids[playerId] ?? 0;
    const tricks = draftTricks[playerId] ?? 0;

    if (bid === 0) {
      setBidMenuCell(cellKey);
      return;
    }

    if (tricks === 0) {
      setTricksInputCell(cellKey);
      setTricksInputValue('');
      return;
    }

    setTricksInputCell(cellKey);
    setTricksInputValue(String(tricks));
  };

  const handleCellLongPressStart = (playerId: string) => {
    if (!currentRoundTemplate) {
      return;
    }

    const bid = draftBids[playerId] ?? 0;
    if (bid === 0) {
      return;
    }

    clearLongPressTimer();
    longPressTimer.current = window.setTimeout(() => {
      setDraftTricks((current) => ({
        ...current,
        [playerId]: bid,
      }));
      longPressTriggeredRef.current = true;
      setBidMenuCell(null);
      setTricksInputCell(null);
      setTricksInputValue('');
      clearLongPressTimer();
    }, 1500);
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
    setScreen('game');
  };

  const handleConfirmRound = () => {
    if (!game || !currentRoundTemplate) {
      return;
    }

    const round: Round = {
      cardCount: currentRoundTemplate.cardCount,
      roundType: currentRoundTemplate.roundType,
      bids: draftBids,
      tricks: draftTricks,
    };

    addRound(round);
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
      await saveGame(new Date().toISOString(), playerScores);
      resetGame();
      setScreen('home');
      const rows = await fetchLeaderboard();
      setLeaderboard(rows);
      const gameRows = await fetchGames();
      setGames(gameRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the game.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
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
              <button type="button" className="secondary-button" onClick={undoLastRound}>
                Undo last
              </button>
              <button type="button" className="secondary-button" onClick={() => setScreen('summary')}>
                Finish game
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
                  <div className="score-table-label">
                    <span>{row.cardCount}</span>
                    {labelText ? <small>{labelText}</small> : null}
                  </div>

                  {game.playerIds.map((playerId, playerColumnIndex) => {
                    let bid = previousRound?.bids[playerId] ?? 0;
                    let tricks = previousRound?.tricks[playerId] ?? 0;

                    if (isCurrentRound) {
                      bid = draftBids[playerId] ?? 0;
                      tricks = draftTricks[playerId] ?? 0;
                    }

                    const points = previousRound ? calcPoints(bid, tricks, row.roundType) : 0;
                    const isDealerCell = playerColumnIndex === dealerIndex;
                    const cellKey = `${playerId}-${index}`;

                    let displayValue: string;
                    if (isCurrentRound) {
                      displayValue = bid > 0 ? `${bid}-` : '-';
                      if (tricks > 0) {
                        displayValue = `${bid}-${tricks}`;
                      }
                    } else if (previousRound) {
                      displayValue = `${bid}-${points}`;
                    } else {
                      displayValue = '-';
                    }

                    return (
                      <div
                        key={cellKey}
                        className={`score-table-cell ${isDealerCell ? 'dealer-highlight' : ''} ${isCurrentRound ? 'cell-editable' : ''}`}
                        onTouchStart={() => isCurrentRound && handleCellLongPressStart(playerId)}
                        onTouchEnd={handleCellLongPressEnd}
                        onMouseDown={() => isCurrentRound && handleCellLongPressStart(playerId)}
                        onMouseUp={handleCellLongPressEnd}
                        onClick={() => isCurrentRound && handleCellTap(playerId, index)}
                      >
                        {previousRound || tricks > 0 ? (
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

          {bidMenuCell && currentRoundTemplate && (
            <div className="cell-modal-overlay" onClick={() => setBidMenuCell(null)}>
              <div className="cell-modal" onClick={(e) => e.stopPropagation()}>
                <p className="cell-modal-title">Select bid (0–{currentRoundTemplate.cardCount})</p>
                <div className="bid-menu">
                  {Array.from({ length: currentRoundTemplate.cardCount + 1 }, (_, i) => i).map(
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

          <button type="button" className="primary-button" onClick={handleConfirmRound}>
            Confirm round
          </button>
        </div>
      </main>
    );
  };

  const renderSummary = () => {
    if (!game) {
      return null;
    }

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

          <div className="score-grid">
            {game.playerIds.map((playerId) => (
              <div key={playerId} className="score-card">
                <h2>{playerNameById[playerId] ?? playerId}</h2>
                <strong>{totals[playerId] ?? 0}</strong>
              </div>
            ))}
          </div>

          {winner ? <p className="winner-banner">Winner: {playerNameById[winner] ?? winner}</p> : null}

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
        </div>
      </div>
    </main>
  );

  const renderGameHistory = () => {
    const gameCount = games.length;

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
            {games.length === 0 ? (
              <p className="empty-state">No games saved yet.</p>
            ) : (
              games.map((savedGame, index) => {
                const gameDate = new Date(savedGame.played_at);
                const dateStr = gameDate.toLocaleDateString('en-GB');
                const timeStr = gameDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const gameNumber = gameCount - index;
                const winner = savedGame.scores.length > 0
                  ? savedGame.scores.reduce((max, curr) => (curr.score > max.score ? curr : max))
                  : null;

                return (
                  <div key={savedGame.id} className="game-row">
                    <div className="game-info">
                      <div><strong>Game #{gameNumber}</strong></div>
                      <div className="game-date">{dateStr} at {timeStr}</div>
                      <div className="game-scores">
                        {savedGame.scores.map((score) => (
                          <span key={score.player_id}>
                            {score.name}: <strong>{score.score}</strong>
                          </span>
                        ))}
                      </div>
                      {winner ? <div className="game-winner">Winner: {winner.name}</div> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
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

  return renderHistory();
}

export default App;
