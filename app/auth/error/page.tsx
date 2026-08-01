import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthErrorReasonMessage } from "@/lib/auth/errors";
import { Suspense } from "react";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const params = await searchParams;

  return (
    <p className="text-sm text-muted-foreground" role="alert">
      {getAuthErrorReasonMessage(params?.reason)}
    </p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle as="h1" className="text-2xl">
                Sorry, something went wrong.
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense>
                <ErrorContent searchParams={searchParams} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
