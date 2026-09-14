import { follow, unfollow } from "@/app/tipsters/actions";

/** Follow or unfollow a tipster; their calls then show next to ours. */
export function FollowButton({ code, following, small }: { code: string; following: boolean; small?: boolean }) {
  const size = small ? "btn-sm" : "";
  return following ? (
    <form action={unfollow.bind(null, code)}>
      <button type="submit" className={`btn btn-secondary ${size}`}>Following</button>
    </form>
  ) : (
    <form action={follow.bind(null, code)}>
      <button type="submit" className={`btn btn-primary ${size}`}>Follow</button>
    </form>
  );
}
