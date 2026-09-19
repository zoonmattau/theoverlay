/** "Dawn Dancer" as "dawndancer": one horse, however the feed spells it. */
export const horseKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
