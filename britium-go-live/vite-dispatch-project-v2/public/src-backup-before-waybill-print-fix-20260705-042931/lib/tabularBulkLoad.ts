export const readBulkTemplateRows = (content: string) => {
  return content.split('\n').map(row => row.split(','));
};