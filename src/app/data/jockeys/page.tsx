import { Suspense } from "react";

import { PeopleList } from "../people";

export default function Page({ searchParams }: PageProps<"/data/jockeys">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <PeopleList kind="jockey" searchParams={searchParams} />
    </Suspense>
  );
}
