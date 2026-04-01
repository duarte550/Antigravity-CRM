import type { Operation, Task, Event, Rating, Sentiment } from '../types';
import { TaskStatus } from '../types';

const REVIEW_TASK_NAMES = ['Revisão Gerencial', 'Revisão Política'];
const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function calculateNextDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate);
  switch (frequency) {
    case 'Diário':     date.setDate(date.getDate() + 1);        break;
    case 'Semanal':    date.setDate(date.getDate() + 7);        break;
    case 'Quinzenal':  date.setDate(date.getDate() + 15);       break;
    case 'Mensal':     date.setMonth(date.getMonth() + 1);      break;
    case 'Trimestral': date.setMonth(date.getMonth() + 3);      break;
    case 'Semestral':  date.setMonth(date.getMonth() + 6);      break;
    case 'Anual':      date.setFullYear(date.getFullYear() + 1); break;
    default: break;
  }
  return date.toISOString();
}

export interface ReviewSaveData {
  event: Omit<Event, 'id'>;
  ratingOp: Rating;
  ratingGroup: Rating;
  ratingMasterGroup?: Rating;  // opcional — nem todos os formulários expõem esse campo
  sentiment: Sentiment;
  videoUrl?: string;
}

export interface ReviewUpdateResult {
  updatedOperation: Operation;
  reviewTitle: string;
}

/**
 * Pure function — builds the updated Operation object after a credit review is completed.
 * All date and ID generation happens here so App.tsx only orchestrates persistence.
 */
export function buildReviewUpdate(
  operation: Operation,
  clickedTask: Task,
  data: ReviewSaveData
): ReviewUpdateResult {
  const actualCompletionDate = data.event.date;

  const formattedOriginalDate = clickedTask.dueDate
    ? `${MONTH_NAMES[new Date(clickedTask.dueDate).getUTCMonth()]}/${new Date(clickedTask.dueDate).getUTCFullYear().toString().slice(-2)}`
    : 'Sem Prazo';

  let nextEstimatedDate = operation.estimatedDate;
  const updatedRules = operation.taskRules.map(rule => {
    if (REVIEW_TASK_NAMES.includes(rule.name)) {
      if (rule.id === clickedTask.ruleId) {
        nextEstimatedDate = calculateNextDate(actualCompletionDate, rule.frequency);
      }
      return { ...rule, startDate: actualCompletionDate };
    }
    return rule;
  });

  const reviewTitle = `Conclusão: Revisão de crédito - ${operation.name} - ${formattedOriginalDate}`;

  const eventToAdd: Event = {
    id: Date.now() + Math.random(),
    title: reviewTitle,
    date: actualCompletionDate,
    type: 'Revisão Periódica',
    description: data.event.description,
    registeredBy: data.event.registeredBy,
    nextSteps: data.event.nextSteps,
    attentionPoints: data.event.attentionPoints,
    completedTaskId: clickedTask.id,
  };

  const newHistoryEntry = {
    id: Date.now() + 1,
    date: actualCompletionDate,
    ratingOperation: data.ratingOp,
    ratingGroup: data.ratingGroup,
    ratingMasterGroup: data.ratingMasterGroup,
    watchlist: operation.watchlist,
    sentiment: data.sentiment,
    eventId: eventToAdd.id,
  };

  const updatedOperation: Operation = {
    ...operation,
    ratingOperation: data.ratingOp,
    ratingGroup: data.ratingGroup,
    ...(data.ratingMasterGroup ? { ratingMasterGroup: data.ratingMasterGroup } : {}),
    events: [...operation.events, eventToAdd],
    ratingHistory: [...operation.ratingHistory, newHistoryEntry],
    taskRules: updatedRules,
    tasks: operation.tasks.filter(
      t => !REVIEW_TASK_NAMES.includes(t.ruleName) || t.status === TaskStatus.COMPLETED
    ),
    estimatedDate: nextEstimatedDate,
  };

  return { updatedOperation, reviewTitle };
}
