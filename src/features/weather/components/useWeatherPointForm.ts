import { useForm } from '@mantine/form';

import { parseLatLng, updateWeatherPointSchema, type UpdateWeatherPointInput } from '../schema';

/** 予報地点フォームが扱う入力値（緯度・経度は Google マップの貼り付け形式で1欄にまとめる） */
export type WeatherPointFormValues = {
  name: string;
  latLng: string;
  elevationM: number | string;
};

const EMPTY_VALUES: WeatherPointFormValues = {
  name: '',
  latLng: '',
  elevationM: '',
};

/**
 * 予報地点フォームの useForm インスタンスを生成する。
 * @param initialValues - 登録済み地点の初期値（未指定時は空フォーム）
 */
export function useWeatherPointForm(initialValues?: WeatherPointFormValues) {
  return useForm<WeatherPointFormValues>({
    initialValues: initialValues ?? EMPTY_VALUES,
    validate: {
      name: (value) => {
        if (value.trim().length === 0) return '名前を入力してください';
        if (value.trim().length > 50) return '名前は50文字以内で入力してください';
        return null;
      },
      latLng: (value) => {
        const parsed = parseLatLng(value);
        if (!parsed) return '「36.1234, 137.5678」の形式で入力してください';
        if (Math.abs(parsed.latitude) > 90 || Math.abs(parsed.longitude) > 180) {
          return '緯度・経度の範囲が正しくありません';
        }
        return null;
      },
      elevationM: (value) => {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return '標高を整数で入力してください';
        }
        if (value < 0 || value > 9000) return '標高は0〜9000mの範囲で入力してください';
        return null;
      },
    },
  });
}

/**
 * フォーム入力値を API リクエストへ変換する（緯度・経度は4桁に切り捨てられる）。
 * @param values - 検証済みのフォーム入力値
 * @returns リクエスト値。変換できなければ null
 */
export function toUpdateInput(values: WeatherPointFormValues): UpdateWeatherPointInput | null {
  const coordinates = parseLatLng(values.latLng);
  if (!coordinates) return null;
  const parsed = updateWeatherPointSchema.safeParse({
    name: values.name,
    ...coordinates,
    elevationM: values.elevationM,
  });
  return parsed.success ? parsed.data : null;
}
