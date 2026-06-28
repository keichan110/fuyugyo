import { Button } from "@/components/ui/button";

type PublicShiftsErrorStateProps = {
  error: unknown;
  onRetry: () => void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "データの読み込みに失敗しました";
}

export function PublicShiftsErrorState({
  error,
  onRetry,
}: PublicShiftsErrorStateProps) {
  const message = getErrorMessage(error);

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-center px-4 py-12">
        <div className="max-w-md text-center">
          <div className="mb-2 font-medium text-lg text-red-600 dark:text-red-400">
            エラーが発生しました
          </div>
          <div className="text-muted-foreground text-sm">{message}</div>
          <Button className="mt-6" onClick={onRetry} type="button">
            再試行
          </Button>
        </div>
      </div>
    </div>
  );
}
