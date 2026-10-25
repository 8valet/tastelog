export function searchKey(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function matchesTitle(work: { title: string; aliases?: string[] }, query: string) {
  const words = searchKey(query).split(' ').filter(Boolean);
  return [work.title, ...(work.aliases || [])].some(title => words.every(word => searchKey(title).includes(word)));
}
