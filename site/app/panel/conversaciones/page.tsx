import { ConversationsInboxClient } from './ConversationsInboxClient';

export default function ConversacionesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ConversationsInboxClient searchParamsPromise={searchParams} />;
}
