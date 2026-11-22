import { ConversationDetailClient } from './ConversationDetailClient';

export default function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ConversationDetailClient
      paramsPromise={params}
      searchParamsPromise={searchParams}
    />
  );
}
