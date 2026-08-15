-- Trigger functions execute through their trigger and do not need Data API access.
revoke execute on function public.enforce_room_stamp_limits() from public, anon, authenticated;
