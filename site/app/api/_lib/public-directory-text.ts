import { foldSearchText } from '../../_lib/search-text';

export function normalizeDirectoryQuery(value: string) {
  return foldSearchText(value);
}
