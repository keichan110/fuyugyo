import { useMemo } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { client } from '@/lib/rpc';

import type { DaySummary } from './daily';
import {
  weatherDailyResponseSchema,
  weatherPointResponseSchema,
  weatherPointSchema,
  weatherStepsResponseSchema,
  type UpdateWeatherPointInput,
  type WeatherDailyResponse,
  type WeatherPoint,
  type WeatherStep,
} from './schema';

/** API エラーレスポンスのスキーマ（型アサーションを避けるためランタイム検証する） */
const apiErrorSchema = z.object({ message: z.string().optional() });

/** 時間別ステップのクエリキー */
export const WEATHER_STEPS_QUERY_KEY = ['weather', 'steps'] as const;

/** 予報地点のクエリキー */
export const WEATHER_POINT_QUERY_KEY = ['weather', 'point'] as const;

/** 日別天気のクエリキー */
export const WEATHER_DAILY_QUERY_KEY = ['weather', 'daily'] as const;

/** 予報は3時間ごとにしか更新されないため、30分は再取得しない */
const WEATHER_DAILY_STALE_TIME = 30 * 60 * 1_000;

/** 予報地点を取得する（ADMIN のみ。未登録なら null）。 */
export function useWeatherPoint() {
  return useQuery<WeatherPoint | null>({
    queryKey: WEATHER_POINT_QUERY_KEY,
    queryFn: async () => {
      const res = await client.api.weather.point.$get();
      if (!res.ok) {
        throw new Error('天気予報地点の取得に失敗しました');
      }
      return weatherPointResponseSchema.parse(await res.json());
    },
  });
}

/**
 * 予報地点を登録・更新するミューテーション。
 * 成功後は地点と日別天気のキャッシュを無効化する。
 */
export function useUpdateWeatherPoint() {
  const queryClient = useQueryClient();
  return useMutation<WeatherPoint, Error, UpdateWeatherPointInput>({
    mutationFn: async (input) => {
      const res = await client.api.weather.point.$put({ json: input });
      if (!res.ok) {
        const body = apiErrorSchema.parse(await res.json());
        throw new Error(body.message ?? '天気予報地点の保存に失敗しました');
      }
      return weatherPointSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WEATHER_POINT_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: WEATHER_DAILY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: WEATHER_STEPS_QUERY_KEY });
    },
  });
}

/** 今日以降の日別天気サマリーを取得する（ログインユーザー全員）。 */
export function useWeatherDaily() {
  return useQuery<WeatherDailyResponse>({
    queryKey: WEATHER_DAILY_QUERY_KEY,
    staleTime: WEATHER_DAILY_STALE_TIME,
    queryFn: async () => {
      const res = await client.api.weather.daily.$get();
      if (!res.ok) {
        throw new Error('天気予報の取得に失敗しました');
      }
      return weatherDailyResponseSchema.parse(await res.json());
    },
  });
}

/**
 * 指定日（JST）の時間別ステップを取得する。展開したときだけ取得する遅延クエリ。
 * @param date - 'YYYY-MM-DD'
 * @param enabled - false の間は取得しない
 */
export function useWeatherSteps(date: string, enabled: boolean) {
  return useQuery<WeatherStep[]>({
    queryKey: [...WEATHER_STEPS_QUERY_KEY, date],
    enabled,
    staleTime: WEATHER_DAILY_STALE_TIME,
    queryFn: async () => {
      const res = await client.api.weather.steps.$get({ query: { date } });
      if (!res.ok) {
        throw new Error('時間別の天気の取得に失敗しました');
      }
      return weatherStepsResponseSchema.parse(await res.json()).steps;
    },
  });
}

/**
 * 日付（YYYY-MM-DD）から日別天気を引ける Map を返す。
 * 取得中・失敗時は空の Map になるため、呼び出し側は欠損を前提に扱える。
 */
export function useWeatherByDate(): ReadonlyMap<string, DaySummary> {
  const { data } = useWeatherDaily();
  return useMemo(() => new Map((data?.days ?? []).map((day) => [day.date, day])), [data]);
}
