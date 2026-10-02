export interface SlackProfile {
  real_name?: string;
  display_name?: string;
  title?: string;
  email?: string;
  status_text?: string;
  status_emoji?: string;
  image_48?: string;
}

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  tz?: string;
  profile: SlackProfile;
}

export interface SlackConversation {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_member?: boolean;
  is_archived?: boolean;
  user?: string;
  topic?: { value: string };
  purpose?: { value: string };
  last_read?: string;
}

export interface SlackFile {
  id: string;
  name?: string;
  title?: string;
  pretty_type?: string;
  filetype?: string;
  size?: number;
  permalink?: string;
}

export interface SlackReaction {
  name: string;
  count: number;
  users?: string[];
}

export interface SlackMessage {
  type?: string;
  subtype?: string;
  ts: string;
  user?: string;
  bot_id?: string;
  username?: string;
  bot_profile?: { name?: string };
  text?: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: SlackReaction[];
  files?: SlackFile[];
}

export interface SearchChannel {
  id: string;
  name?: string;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
}

export interface SearchMatch extends SlackMessage {
  channel: SearchChannel;
  permalink?: string;
}

export interface AuthInfo {
  user_id: string;
  user: string;
  team_id: string;
  team: string;
  url: string;
}
