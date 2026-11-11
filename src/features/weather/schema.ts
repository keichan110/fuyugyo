import { z } from 'zod';

import { CONDITIONS } from './daily';

/**
 * Weather feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** 天気データ源の識別子。API を乗り換え・併用するときは別の値で区別する */
export const WEATHER_SOURCE = 'metno:locationforecast';

/** 予報地点の単一レコード */
export const weatherPointSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  elevationM: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type WeatherPoint = z.infer<typeof weatherPointSchema>;

/** `GET /point` のレスポンス（未登録なら null） */
export const weatherPointResponseSchema = weatherPointSchema.nullable();

/**
 * 小数点以下4桁に切り捨てる（MET Norway の利用規約。四捨五入ではない）。
 *
 * @param value - 緯度または経度
 * @returns 切り捨てた値
 */
export function truncateCoordinate(value: number): number {
  return Math.trunc(value * 1e4) / 1e4;
}

/** 予報地点の更新リクエスト（緯度・経度は4桁に切り捨てる） */
export const updateWeatherPointSchema = z.object({
  name: z.string().trim().min(1).max(50),
  latitude: z.number().min(-90).max(90).transform(truncateCoordinate),
  longitude: z.number().min(-180).max(180).transform(truncateCoordinate),
  elevationM: z.number().int().min(0).max(9000),
});

export type UpdateWeatherPointInput = z.infer<typeof updateWeatherPointSchema>;

/**
 * Google マップからコピーした `36.1234, 137.5678` 形式を緯度・経度に分解する。
 *
 * @param text - 貼り付けられた文字列（カンマ区切り・空白は任意）
 * @returns 緯度・経度。解釈できなければ null
 */
export function parseLatLng(text: string): { latitude: number; longitude: number } | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/** 日別サマリー */
export const daySummarySchema = z.object({
  date: z.string(),
  morning: z.enum(CONDITIONS).nullable(),
  afternoon: z.enum(CONDITIONS).nullable(),
  tempMaxC: z.number().nullable(),
  tempMinC: z.number().nullable(),
  precipitationMm: z.number().nullable(),
  windMaxMs: z.number().nullable(),
});

/** `GET /daily` のレスポンス */
export const weatherDailyResponseSchema = z.object({
  days: z.array(daySummarySchema),
  lastFetchedAt: z.coerce.date().nullable(),
});

export type WeatherDailyResponse = z.infer<typeof weatherDailyResponseSchema>;

/** `GET /steps` のクエリ（JST の日付） */
export const weatherStepsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`))),
});

/** 時間別ステップ（開始時刻・刻み幅・天気と数値） */
export const weatherStepSchema = z.object({
  time: z.coerce.date(),
  stepHours: z.number(),
  condition: z.enum(CONDITIONS).nullable(),
  temperatureC: z.number().nullable(),
  precipitationMm: z.number().nullable(),
  windSpeedMs: z.number().nullable(),
});

export type WeatherStep = z.infer<typeof weatherStepSchema>;

/** `GET /steps` のレスポンス */
export const weatherStepsResponseSchema = z.object({
  steps: z.array(weatherStepSchema),
});
