// Public presentation settings only. Never add credentials to this module.
export const libraryConfig = {
  name: process.env.NEXT_PUBLIC_LIBRARY_NAME?.trim() || 'Tastelog',
  description: process.env.NEXT_PUBLIC_LIBRARY_DESCRIPTION?.trim() || 'What I watch. What I play. What stays with me.',
};
