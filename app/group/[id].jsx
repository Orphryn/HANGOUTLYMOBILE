import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppInput from "../../components/AppInput";
import GroupAvatar from "../../components/GroupAvatar";
import ProfileAvatar from "../../components/ProfileAvatar";
import { colors, shadow } from "../../constants/theme";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

const planColors = [
  "#7C5CFF",
  "#2DD4BF",
  "#FFB86B",
  "#F472B6",
  "#60A5FA",
  "#FACC15",
  "#FB7185",
];

const reactionEmojis = ["❤️", "😂", "🔥", "👍", "😮", "😢"];

function displayName(profile) {
  if (!profile) return "Someone";
  return profile.display_name || profile.username || profile.email || "Someone";
}

function isUrl(text) {
  return typeof text === "string" && text.startsWith("https://");
}

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function todayKey() {
  return toDateKey(new Date());
}

function parseDateInput(value) {
  const clean = String(value || "").trim();

  if (!clean) {
    return { error: "Enter a date like 2026-05-16 or 05/16/2026." };
  }

  let year;
  let month;
  let day;

  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (slashMatch) {
    month = Number(slashMatch[1]);
    day = Number(slashMatch[2]);
    year = Number(slashMatch[3]);
  } else {
    return { error: "Use a real date like 2026-05-16 or 05/16/2026." };
  }

  const date = new Date(year, month - 1, day);

  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!valid) {
    return { error: "That date is not valid." };
  }

  return {
    year,
    month,
    day,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`,
  };
}

function parseTimeInput(value, allowBlank = true) {
  const clean = String(value || "").trim().toLowerCase();

  if (!clean) {
    if (allowBlank) {
      return {
        hour: 12,
        minute: 0,
        normalized: null,
      };
    }

    return { error: "Enter a time like 6pm or 18:30." };
  }

  let match = clean.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  let hour;
  let minute;
  let suffix;

  if (match) {
    hour = Number(match[1]);
    minute = Number(match[2]);
    suffix = match[3];
  } else {
    match = clean.match(/^(\d{1,2})\s*(am|pm)$/);

    if (!match) {
      return {
        error: "Use a time like 6pm, 6:30pm, 18:30, or leave it blank.",
      };
    }

    hour = Number(match[1]);
    minute = 0;
    suffix = match[2];
  }

  if (suffix) {
    if (hour < 1 || hour > 12) {
      return { error: "AM/PM times must be between 1 and 12." };
    }

    if (suffix === "pm" && hour !== 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { error: "Use a real time like 6pm or 18:30." };
  }

  return {
    hour,
    minute,
    normalized: `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0"
    )}`,
  };
}

function makeDateTime(dateInput, timeInput, allowBlankTime = true) {
  const parsedDate = parseDateInput(dateInput);

  if (parsedDate.error) return { error: parsedDate.error };

  const parsedTime = parseTimeInput(timeInput, allowBlankTime);

  if (parsedTime.error) return { error: parsedTime.error };

  const date = new Date(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    parsedTime.hour,
    parsedTime.minute,
    0
  );

  if (Number.isNaN(date.getTime())) {
    return { error: "That date or time is invalid." };
  }

  return {
    date,
    dateKey: parsedDate.dateKey,
    time: parsedTime.normalized,
  };
}

function formatLocalTime(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatStoredTime(time) {
  if (!time) return "";

  const [hour, minute] = String(time).split(":").map(Number);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return formatLocalTime(date);
}

function formatPlanDate(value) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMessageDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (toDateKey(date) === toDateKey(today)) return "Today";
  if (toDateKey(date) === toDateKey(yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function chatBackgroundStyle(background) {
  if (background === "warm") {
    return { backgroundColor: "#221A14" };
  }

  if (background === "ocean") {
    return { backgroundColor: "#111F2E" };
  }

  if (background === "forest") {
    return { backgroundColor: "#10231F" };
  }

  return { backgroundColor: colors.bg };
}

function getMediaExtension(asset, fileBody) {
  const mime = asset?.mimeType || fileBody?.type || "";

  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("jpg")) return "jpg";

  const uri = asset?.uri || "";
  const fromUri = uri.split(".").pop()?.split("?")[0]?.toLowerCase();

  if (["gif", "png", "webp", "jpg", "jpeg"].includes(fromUri)) {
    return fromUri === "jpeg" ? "jpg" : fromUri;
  }

  return "jpg";
}

function messageSelect() {
  return `
    id,
    group_id,
    sender_id,
    content,
    message_type,
    media_url,
    media_mime,
    media_width,
    media_height,
    reply_to_id,
    deleted_at,
    created_at,
    profiles:sender_id (
      id,
      username,
      display_name,
      email,
      avatar_url,
      bio,
      availability_note,
      last_seen_at
    )
  `;
}

function DateDivider({ label }) {
  if (!label) return null;

  return (
    <View style={styles.dateDivider}>
      <Text style={styles.dateDividerText}>{label}</Text>
    </View>
  );
}

function ReplyPreview({ reply, mine }) {
  if (!reply) return null;

  const name = displayName(reply.profiles);

  const text = reply.deleted_at
    ? "Deleted message"
    : reply.message_type === "image"
    ? "Image"
    : reply.message_type === "gif"
    ? "GIF"
    : reply.content || "Message";

  return (
    <View style={[styles.replyPreview, mine && styles.replyPreviewMine]}>
      <Text style={[styles.replyName, mine && styles.replyNameMine]}>
        {name}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.replyText, mine && styles.replyTextMine]}
      >
        {text}
      </Text>
    </View>
  );
}

function MessageMedia({ item, onOpen }) {
  const isGif = item.message_type === "gif" || item.media_mime?.includes("gif");

  if (!item.media_url) return null;

  return (
    <Pressable onPress={() => onOpen(item)}>
      <View style={styles.mediaWrap}>
        <Image
          source={{ uri: item.media_url }}
          style={styles.chatImage}
          resizeMode="cover"
        />

        {isGif && (
          <View style={styles.gifBadge}>
            <Text style={styles.gifBadgeText}>GIF</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function MessageContent({ item, mine, onOpenMedia }) {
  if (item.deleted_at) {
    return <Text style={styles.deletedText}>Message deleted</Text>;
  }

  if (item.message_type === "image" || item.message_type === "gif") {
    return <MessageMedia item={item} onOpen={onOpenMedia} />;
  }

  if (isUrl(item.content)) {
    return (
      <Pressable onPress={() => Linking.openURL(item.content)}>
        <Text style={[styles.linkText, mine && styles.myLinkText]}>
          📍 Open location
        </Text>
        <Text style={[styles.urlText, mine && styles.myUrlText]}>
          {item.content}
        </Text>
      </Pressable>
    );
  }

  return (
    <Text style={[styles.messageText, mine && styles.myMessageText]}>
      {item.content}
    </Text>
  );
}

function ReactionBar({ reactions = [], userId, onToggleReaction }) {
  if (!reactions.length) return null;

  const grouped = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) acc[reaction.emoji] = [];
    acc[reaction.emoji].push(reaction);
    return acc;
  }, {});

  return (
    <View style={styles.reactionRow}>
      {Object.entries(grouped).map(([emoji, rows]) => {
        const reactedByMe = rows.some((row) => row.user_id === userId);

        return (
          <Pressable
            key={emoji}
            onPress={() => onToggleReaction(emoji)}
            style={[
              styles.reactionPill,
              reactedByMe && styles.reactionPillMine,
            ]}
          >
            <Text style={styles.reactionText}>
              {emoji} {rows.length}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MessageRow({
  item,
  mine,
  replyMessage,
  reactions,
  showDateDivider,
  visibleTimeId,
  setVisibleTimeId,
  online,
  previousSameSender,
  onOpenMedia,
  onLongPress,
  onAvatarPress,
  onToggleReaction,
  userId,
}) {
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 18) {
          setVisibleTimeId(item.id);
        }
      },
      onPanResponderRelease: () => setVisibleTimeId(null),
      onPanResponderTerminate: () => setVisibleTimeId(null),
    })
  ).current;

  const visibleTime = visibleTimeId === item.id;
  const isMedia = item.message_type === "image" || item.message_type === "gif";

  return (
    <View>
      {showDateDivider && <DateDivider label={formatMessageDate(item.created_at)} />}

      <View
        {...panResponder.panHandlers}
        style={[
          styles.messageRow,
          mine && styles.myMessageRow,
          previousSameSender && styles.tightMessage,
        ]}
      >
        {!mine && (
          <View style={styles.leftAvatarSlot}>
            {!previousSameSender && (
              <Pressable onPress={() => onAvatarPress(item.profiles)}>
                <ProfileAvatar
                  profile={item.profiles}
                  size={36}
                  showOnline
                  online={online}
                />
              </Pressable>
            )}
          </View>
        )}

        {mine && visibleTime && (
          <Text style={styles.revealedTime}>
            {formatLocalTime(item.created_at)}
          </Text>
        )}

        <View style={styles.messageStack}>
          <Pressable
            onLongPress={() => onLongPress(item)}
            onPress={() => {
              if (visibleTime) setVisibleTimeId(null);
            }}
            style={[
              styles.bubble,
              isMedia && styles.mediaBubble,
              mine ? styles.myBubble : styles.theirBubble,
              item.deleted_at && styles.deletedBubble,
            ]}
          >
            {!!replyMessage && !item.deleted_at && (
              <ReplyPreview reply={replyMessage} mine={mine} />
            )}

            <MessageContent item={item} mine={mine} onOpenMedia={onOpenMedia} />

            {item.optimistic && <Text style={styles.sendingText}>sending...</Text>}
          </Pressable>

          <ReactionBar
            reactions={reactions}
            userId={userId}
            onToggleReaction={(emoji) => onToggleReaction(item, emoji)}
          />
        </View>

        {!mine && visibleTime && (
          <Text style={styles.revealedTime}>
            {formatLocalTime(item.created_at)}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function GroupDetail() {
  const params = useLocalSearchParams();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();

  const presenceChannelRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  const [activeTab, setActiveTab] = useState("chat");
  const [notice, setNotice] = useState("");
  const [visibleTimeId, setVisibleTimeId] = useState(null);

  const [group, setGroup] = useState(null);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [creatorMap, setCreatorMap] = useState({});
  const [reactionsByMessage, setReactionsByMessage] = useState({});

  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteMessageType, setInviteMessageType] = useState("error");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState(todayKey());
  const [taskDueTime, setTaskDueTime] = useState("");
  const [taskColor, setTaskColor] = useState("#2DD4BF");

  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(todayKey());
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventColor, setEventColor] = useState("#7C5CFF");

  const messageMap = useMemo(() => {
    const map = {};

    for (const message of messages) {
      map[message.id] = message;
    }

    return map;
  }, [messages]);

  async function safeAlert(title, message) {
    if (!mountedRef.current) return;
    Alert.alert(title, message);
  }

  async function attachCreators(items) {
    const ids = [
      ...new Set((items || []).map((item) => item.creator_id).filter(Boolean)),
    ];

    if (ids.length === 0) return {};

    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, email, avatar_url")
      .in("id", ids);

    const map = {};

    for (const row of data || []) {
      map[row.id] = row;
    }

    return map;
  }

  async function updateLastSeen() {
    if (!user?.id) return;

    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  async function loadReactions() {
    const { data, error } = await supabase
      .from("message_reactions")
      .select(
        `
        id,
        message_id,
        user_id,
        emoji,
        created_at,
        profiles:user_id (
          id,
          username,
          display_name,
          avatar_url
        )
      `
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.log("Could not load reactions:", error.message);
      return;
    }

    const grouped = {};

    for (const reaction of data || []) {
      if (!grouped[reaction.message_id]) grouped[reaction.message_id] = [];
      grouped[reaction.message_id].push(reaction);
    }

    if (mountedRef.current) {
      setReactionsByMessage(grouped);
    }
  }

  async function loadGroup() {
    if (!groupId || !user?.id) return;

    await updateLastSeen();

    const { data: myProfile } = await supabase
      .from("profiles")
      .select(
        "id, username, display_name, email, avatar_url, bio, availability_status, availability_note"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (mountedRef.current) {
      setProfile(myProfile);
    }

    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .select(
        `
        id,
        name,
        description,
        created_by,
        avatar_color,
        avatar_emoji,
        avatar_url,
        chat_background,
        created_at
      `
      )
      .eq("id", groupId)
      .maybeSingle();

    if (groupError) {
      safeAlert("Could not load group", groupError.message);
      return;
    }

    if (!groupData) {
      router.replace("/dashboard");
      return;
    }

    if (mountedRef.current) {
      setGroup(groupData);
    }

    const { data: messageRows, error: messageError } = await supabase
      .from("messages")
      .select(messageSelect())
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(150);

    if (messageError) {
      safeAlert("Could not load messages", messageError.message);
    } else if (mountedRef.current) {
      setMessages(messageRows || []);
    }

    const { data: memberRows } = await supabase
      .from("group_members")
      .select(
        `
        id,
        user_id,
        role,
        status,
        profiles:user_id (
          id,
          username,
          display_name,
          email,
          avatar_url,
          bio,
          availability_status,
          availability_note,
          last_seen_at
        )
      `
      )
      .eq("group_id", groupId)
      .eq("status", "accepted");

    if (mountedRef.current) {
      setMembers(memberRows || []);
    }

    const { data: taskRows, error: taskError } = await supabase
      .from("planner_tasks")
      .select(
        `
        id,
        creator_id,
        group_id,
        title,
        due_at,
        due_time,
        completed,
        color,
        created_at
      `
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    if (taskError) {
      safeAlert("Could not load tasks", taskError.message);
    } else if (mountedRef.current) {
      setTasks(taskRows || []);
    }

    const { data: eventRows, error: eventError } = await supabase
      .from("planner_events")
      .select(
        `
        id,
        creator_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        start_time,
        end_time,
        is_all_day,
        completed,
        color,
        created_at
      `
      )
      .eq("group_id", groupId)
      .order("starts_at", { ascending: true });

    if (eventError) {
      safeAlert("Could not load events", eventError.message);
    } else if (mountedRef.current) {
      setEvents(eventRows || []);
    }

    const map = await attachCreators([...(taskRows || []), ...(eventRows || [])]);

    if (mountedRef.current) {
      setCreatorMap(map);
    }

    await loadReactions();
  }

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!groupId || !user?.id) return;

    loadGroup();

    const chatChannel = supabase
      .channel(`group-room-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const incoming = payload.new;

          const { data: fullMessage } = await supabase
            .from("messages")
            .select(messageSelect())
            .eq("id", incoming.id)
            .maybeSingle();

          const finalMessage = fullMessage || incoming;

          setMessages((prev) => {
            if (prev.some((msg) => msg.id === finalMessage.id)) return prev;

            const optimisticIndex = prev.findIndex(
              (msg) =>
                msg.optimistic &&
                msg.sender_id === finalMessage.sender_id &&
                msg.content === finalMessage.content &&
                msg.media_url === finalMessage.media_url
            );

            if (optimisticIndex !== -1) {
              const copy = [...prev];
              copy[optimisticIndex] = { ...finalMessage, optimistic: false };
              return copy;
            }

            return [finalMessage, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const { data: fullMessage } = await supabase
            .from("messages")
            .select(messageSelect())
            .eq("id", payload.new.id)
            .maybeSingle();

          const finalMessage = fullMessage || payload.new;

          setMessages((prev) =>
            prev.map((msg) => (msg.id === finalMessage.id ? finalMessage : msg))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planner_tasks",
          filter: `group_id=eq.${groupId}`,
        },
        () => loadGroup()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "planner_events",
          filter: `group_id=eq.${groupId}`,
        },
        () => loadGroup()
      )
      .subscribe();

    const reactionChannel = supabase
      .channel(`message-reactions-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        () => loadReactions()
      )
      .subscribe();

    const presenceChannel = supabase.channel(`presence-group-${groupId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    presenceChannelRef.current = presenceChannel;

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();

        const ids = Object.keys(state);

        const typers = Object.entries(state)
          .flatMap(([id, rows]) =>
            rows.map((row) => ({
              id,
              username: row.username,
              display_name: row.display_name,
              typing: row.typing,
            }))
          )
          .filter((row) => row.id !== user.id && row.typing);

        if (mountedRef.current) {
          setOnlineIds(ids);
          setTypingUsers(typers);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: user.id,
            username: profile?.username || user?.email || "someone",
            display_name: displayName(profile),
            typing: false,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(reactionChannel);
      supabase.removeChannel(presenceChannel);
      presenceChannelRef.current = null;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [groupId, user?.id]);

  useEffect(() => {
    if (!presenceChannelRef.current || !user?.id || !profile?.id) return;

    presenceChannelRef.current.track({
      user_id: user.id,
      username: profile?.username || user?.email || "someone",
      display_name: displayName(profile),
      typing: false,
      online_at: new Date().toISOString(),
    });
  }, [profile?.id, profile?.username, profile?.display_name, user?.id]);

  async function trackTyping(isTyping) {
    if (!presenceChannelRef.current || !user?.id) return;

    await presenceChannelRef.current.track({
      user_id: user.id,
      username: profile?.username || user.email || "someone",
      display_name: displayName(profile),
      typing: isTyping,
      online_at: new Date().toISOString(),
    });
  }

  function handleContentChange(value) {
    setContent(value);

    trackTyping(value.trim().length > 0);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      trackTyping(false);
    }, 1600);
  }

  async function notifyGroupMembers(title, body) {
    const { error } = await supabase.rpc("notify_group_members", {
      input_group_id: groupId,
      input_title: title,
      input_body: body,
      input_link: `/group/${groupId}`,
    });

    if (error) console.log("Notification RPC failed:", error.message);
  }

  async function sendMessage() {
    const text = content.trim();

    if (!text) return;

    const currentReply = replyTo;
    const tempId = `temp-${Date.now()}`;

    const optimisticMessage = {
      id: tempId,
      group_id: groupId,
      sender_id: user.id,
      content: text,
      message_type: "text",
      media_url: null,
      media_mime: null,
      media_width: null,
      media_height: null,
      reply_to_id: currentReply?.id || null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      profiles: profile,
      optimistic: true,
    };

    setMessages((prev) => [optimisticMessage, ...prev]);
    setContent("");
    setReplyTo(null);
    trackTyping(false);

    const { data: savedMessage, error } = await supabase
      .from("messages")
      .insert({
        group_id: groupId,
        sender_id: user.id,
        content: text,
        message_type: "text",
        reply_to_id: currentReply?.id || null,
      })
      .select(messageSelect())
      .single();

    if (error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      return Alert.alert("Message failed", error.message);
    }

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === tempId ? { ...savedMessage, optimistic: false } : msg
      )
    );
  }

  async function pickChatMedia() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.95,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    await sendChatMedia(result.assets[0]);
  }

  async function sendChatMedia(asset) {
    if (!asset?.uri || !user?.id || !groupId) return;

    const currentReply = replyTo;
    setUploadingMedia(true);

    try {
      const response = await fetch(asset.uri);
      const fileBody = await response.blob();

      const extension = getMediaExtension(asset, fileBody);

      const contentType =
        asset.mimeType ||
        fileBody.type ||
        (extension === "gif" ? "image/gif" : "image/jpeg");

      const messageType =
        contentType.includes("gif") || extension === "gif" ? "gif" : "image";

      const path = `${groupId}/${user.id}/chat-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(path, fileBody, {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("chat-media").getPublicUrl(path);

      if (!data?.publicUrl) {
        throw new Error("Media uploaded, but Supabase did not return a public URL.");
      }

      const tempId = `temp-media-${Date.now()}`;

      const optimisticMessage = {
        id: tempId,
        group_id: groupId,
        sender_id: user.id,
        content: "",
        message_type: messageType,
        media_url: data.publicUrl,
        media_mime: contentType,
        media_width: asset.width || null,
        media_height: asset.height || null,
        reply_to_id: currentReply?.id || null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        profiles: profile,
        optimistic: true,
      };

      setMessages((prev) => [optimisticMessage, ...prev]);
      setReplyTo(null);

      const { data: savedMessage, error } = await supabase
        .from("messages")
        .insert({
          group_id: groupId,
          sender_id: user.id,
          content: "",
          message_type: messageType,
          media_url: data.publicUrl,
          media_mime: contentType,
          media_width: asset.width || null,
          media_height: asset.height || null,
          reply_to_id: currentReply?.id || null,
        })
        .select(messageSelect())
        .single();

      if (error) throw error;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...savedMessage, optimistic: false } : msg
        )
      );
    } catch (err) {
      Alert.alert("Media failed", err.message);
    } finally {
      setUploadingMedia(false);
    }
  }

  async function copyMessage(message) {
    if (!message?.content || message.deleted_at) {
      setActionMessage(null);
      return;
    }

    await Clipboard.setStringAsync(message.content);
    setActionMessage(null);
    setNotice("Copied message.");
  }

  async function deleteMessage(message) {
    if (message.sender_id !== user.id) {
      return Alert.alert("Not yours", "You can only delete your own messages.");
    }

    const doDelete = async () => {
      const { error } = await supabase
        .from("messages")
        .update({
          content: "",
          media_url: null,
          media_mime: null,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", message.id)
        .eq("sender_id", user.id);

      if (error) return Alert.alert("Delete failed", error.message);

      setActionMessage(null);
      await loadGroup();
    };

    if (Platform.OS === "web") {
      const confirmed = window.confirm("Delete this message?");
      if (confirmed) await doDelete();
      return;
    }

    Alert.alert("Delete message?", "This removes the message from the chat.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  }

  async function toggleReaction(message, emoji) {
    if (!message?.id || message.optimistic || message.deleted_at) return;

    const existing = (reactionsByMessage[message.id] || []).find(
      (reaction) => reaction.user_id === user.id && reaction.emoji === emoji
    );

    if (existing) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existing.id);

      if (error) Alert.alert("Reaction failed", error.message);

      return;
    }

    const { error } = await supabase.from("message_reactions").insert({
      message_id: message.id,
      user_id: user.id,
      emoji,
    });

    if (error) Alert.alert("Reaction failed", error.message);
  }

  async function createTask() {
    const title = taskTitle.trim();

    if (!title) return Alert.alert("Missing task", "Write the task first.");

    const due = makeDateTime(taskDate, taskDueTime, true);

    if (due.error) return Alert.alert("Invalid date or time", due.error);

    const { data: createdTask, error } = await supabase
      .from("planner_tasks")
      .insert({
        creator_id: user.id,
        group_id: groupId,
        title,
        due_at: due.date.toISOString(),
        due_time: due.time,
        completed: false,
        color: taskColor,
      })
      .select(
        `
        id,
        creator_id,
        group_id,
        title,
        due_at,
        due_time,
        completed,
        color,
        created_at
      `
      )
      .single();

    if (error) return Alert.alert("Task failed", error.message);

    await notifyGroupMembers(
      "New group task",
      `${title} was added to ${group?.name || "this group"}.`
    );

    await supabase.from("messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content: `✅ Task created: ${title} — ${due.dateKey}${
        due.time ? ` at ${formatStoredTime(due.time)}` : ""
      }`,
      message_type: "system",
    });

    setTasks((prev) => [createdTask, ...prev]);
    setCreatorMap((prev) => ({ ...prev, [user.id]: profile }));
    setTaskTitle("");
    setTaskDate(todayKey());
    setTaskDueTime("");
    setTaskColor("#2DD4BF");
    setNotice(`Task created: ${title}`);

    await loadGroup();
  }

  async function createEvent() {
    const title = eventTitle.trim();

    if (!title) return Alert.alert("Missing event", "Give the event a title.");

    const start = makeDateTime(eventDate, eventAllDay ? "" : eventStartTime, true);

    if (start.error) return Alert.alert("Invalid date or time", start.error);

    let endDate;
    let normalizedEndTime = null;

    if (eventEndTime.trim()) {
      const end = makeDateTime(eventDate, eventEndTime, true);

      if (end.error) return Alert.alert("Invalid end time", end.error);

      endDate = end.date;
      normalizedEndTime = end.time;
    } else {
      endDate = new Date(start.date.getTime() + 60 * 60 * 1000);
    }

    const { data: createdEvent, error } = await supabase
      .from("planner_events")
      .insert({
        creator_id: user.id,
        group_id: groupId,
        title,
        starts_at: start.date.toISOString(),
        ends_at: endDate.toISOString(),
        start_time: eventAllDay ? null : start.time,
        end_time: eventAllDay ? null : normalizedEndTime,
        is_all_day: eventAllDay,
        completed: false,
        color: eventColor,
      })
      .select(
        `
        id,
        creator_id,
        group_id,
        title,
        description,
        starts_at,
        ends_at,
        start_time,
        end_time,
        is_all_day,
        completed,
        color,
        created_at
      `
      )
      .single();

    if (error) return Alert.alert("Event failed", error.message);

    await notifyGroupMembers(
      "New group event",
      `${title} was added to ${group?.name || "this group"}.`
    );

    await supabase.from("messages").insert({
      group_id: groupId,
      sender_id: user.id,
      content: `📅 Event created: ${title} — ${start.dateKey}${
        eventAllDay
          ? " all day"
          : start.time
          ? ` at ${formatStoredTime(start.time)}`
          : ""
      }`,
      message_type: "system",
    });

    setEvents((prev) => [createdEvent, ...prev]);
    setCreatorMap((prev) => ({ ...prev, [user.id]: profile }));
    setEventTitle("");
    setEventDate(todayKey());
    setEventStartTime("");
    setEventEndTime("");
    setEventAllDay(false);
    setEventColor("#7C5CFF");
    setNotice(`Event created: ${title}`);

    await loadGroup();
  }

  async function toggleTask(task) {
    if (task.creator_id !== user.id) {
      return Alert.alert(
        "View only",
        "Only the person who created this task can mark it complete."
      );
    }

    const { error } = await supabase
      .from("planner_tasks")
      .update({ completed: !task.completed })
      .eq("id", task.id);

    if (error) return Alert.alert("Task update failed", error.message);

    await loadGroup();
  }

  async function deleteTask(task) {
    if (task.creator_id !== user.id) {
      return Alert.alert(
        "View only",
        "Only the person who created this task can delete it."
      );
    }

    const { error } = await supabase.from("planner_tasks").delete().eq("id", task.id);

    if (error) return Alert.alert("Delete failed", error.message);

    await loadGroup();
  }

  async function deleteEvent(event) {
    if (event.creator_id !== user.id) {
      return Alert.alert(
        "View only",
        "Only the person who created this event can delete it."
      );
    }

    const { error } = await supabase
      .from("planner_events")
      .delete()
      .eq("id", event.id);

    if (error) return Alert.alert("Delete failed", error.message);

    await loadGroup();
  }

  async function inviteUser() {
    const username = inviteUsername.trim().toLowerCase();
    setInviteMessage("");

    if (!username) {
      setInviteMessageType("error");
      setInviteMessage("Type a username first.");
      return;
    }

    const { data: foundProfile, error: searchError } = await supabase
      .from("profiles")
      .select("id, username, allow_group_invites")
      .eq("username", username)
      .maybeSingle();

    if (searchError) {
      setInviteMessageType("error");
      setInviteMessage(searchError.message);
      return;
    }

    if (!foundProfile?.id) {
      setInviteMessageType("error");
      setInviteMessage(
        "No user found with that username. Make sure they created and verified their account."
      );
      return;
    }

    if (foundProfile.allow_group_invites === false) {
      setInviteMessageType("error");
      setInviteMessage("That user is not accepting group invites right now.");
      return;
    }

    if (foundProfile.id === user.id) {
      setInviteMessageType("error");
      setInviteMessage("You are already in this group.");
      return;
    }

    const alreadyMember = members.some((member) => member.user_id === foundProfile.id);

    if (alreadyMember) {
      setInviteMessageType("error");
      setInviteMessage("That user is already in this group.");
      return;
    }

    const { error } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: foundProfile.id,
      invited_by: user.id,
      role: "member",
      status: "pending",
    });

    if (error) {
      setInviteMessageType("error");
      setInviteMessage(error.message);
      return;
    }

    await supabase.from("notifications").insert({
      user_id: foundProfile.id,
      type: "group_invite",
      title: "Group invite",
      body: `${displayName(profile)} invited you to ${group?.name || "a group"}.`,
      read: false,
      link: "/dashboard",
    });

    setInviteUsername("");
    setInviteMessageType("success");
    setInviteMessage(`${username} was invited.`);
  }

  async function actuallyLeaveGroup() {
    const { error } = await supabase.rpc("leave_group_and_cleanup", {
      input_group_id: groupId,
    });

    if (error) return Alert.alert("Could not leave group", error.message);

    router.replace("/dashboard");
  }

  async function leaveGroup() {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Leave group? Your plans for this group will be erased."
      );

      if (confirmed) await actuallyLeaveGroup();

      return;
    }

    Alert.alert("Leave group?", "Your plans for this group will be erased.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: actuallyLeaveGroup },
    ]);
  }

  const completedTasks = tasks.filter((task) => task.completed);
  const openTasks = tasks.filter((task) => !task.completed);
  const progress = tasks.length
    ? Math.round((completedTasks.length / tasks.length) * 100)
    : 0;

  const onlineMembers = members.filter((member) => onlineIds.includes(member.user_id));

  function renderPlanOwner(item) {
    const creator = creatorMap[item.creator_id];
    const own = item.creator_id === user.id;

    return own ? "Created by you" : `Created by ${displayName(creator)}`;
  }

  function renderOwnershipPill(item) {
    const own = item.creator_id === user.id;
    return own ? "Editable" : "View only";
  }

  function memberBusyCount(memberId) {
    const today = todayKey();

    const busyEvents = events.filter(
      (event) =>
        event.creator_id === memberId &&
        toDateKey(new Date(event.starts_at)) === today
    );

    const openMemberTasks = tasks.filter(
      (task) =>
        task.creator_id === memberId &&
        !task.completed &&
        toDateKey(new Date(task.due_at)) === today
    );

    return busyEvents.length + openMemberTasks.length;
  }

  function typingText() {
    if (typingUsers.length === 0) return "";

    if (typingUsers.length === 1) {
      return `${typingUsers[0].display_name || typingUsers[0].username} is typing...`;
    }

    return `${typingUsers.length} people are typing...`;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.page, chatBackgroundStyle(group?.chat_background)]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>

        <GroupAvatar
          name={group?.name}
          color={group?.avatar_color}
          emoji={group?.avatar_emoji}
          avatarUrl={group?.avatar_url}
          size={54}
        />

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{group?.name || "Group"}</Text>

          <Text style={styles.muted}>
            {members.length} member{members.length === 1 ? "" : "s"} •{" "}
            {onlineMembers.length} active now
          </Text>
        </View>

        <Pressable
          onPress={() => router.push(`/group-settings/${groupId}`)}
          style={styles.settingsButton}
        >
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </Pressable>

        <Pressable onPress={leaveGroup} style={styles.leaveButton}>
          <Text style={styles.leaveText}>Leave</Text>
        </Pressable>
      </View>

      {!!notice && (
        <Pressable onPress={() => setNotice("")} style={styles.notice}>
          <Text style={styles.noticeText}>✅ {notice}</Text>
        </Pressable>
      )}

      <View style={styles.tabs}>
        {["chat", "tasks", "calendar", "members"].map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "chat" && (
        <>
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.messages}
            renderItem={({ item, index }) => {
              const mine = item.sender_id === user?.id;
              const nextOlder = messages[index + 1];
              const nextNewer = messages[index - 1];

              const showDateDivider =
                !nextOlder ||
                toDateKey(new Date(item.created_at)) !==
                  toDateKey(new Date(nextOlder.created_at));

              const previousSameSender =
                nextNewer &&
                nextNewer.sender_id === item.sender_id &&
                toDateKey(new Date(nextNewer.created_at)) ===
                  toDateKey(new Date(item.created_at));

              return (
                <MessageRow
                  item={item}
                  mine={mine}
                  replyMessage={messageMap[item.reply_to_id]}
                  reactions={reactionsByMessage[item.id] || []}
                  showDateDivider={showDateDivider}
                  visibleTimeId={visibleTimeId}
                  setVisibleTimeId={setVisibleTimeId}
                  online={onlineIds.includes(item.sender_id)}
                  previousSameSender={previousSameSender}
                  onOpenMedia={setSelectedMedia}
                  onLongPress={setActionMessage}
                  onAvatarPress={setProfilePreview}
                  onToggleReaction={toggleReaction}
                  userId={user.id}
                />
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Quiet room. Say the first thing.</Text>
            }
          />

          {!!typingText() && (
            <View style={styles.typingBar}>
              <Text style={styles.typingText}>{typingText()}</Text>
            </View>
          )}

          {!!replyTo && (
            <View style={styles.replyComposer}>
              <View style={{ flex: 1 }}>
                <Text style={styles.replyComposerLabel}>
                  Replying to {displayName(replyTo.profiles)}
                </Text>
                <Text numberOfLines={1} style={styles.replyComposerText}>
                  {replyTo.deleted_at
                    ? "Deleted message"
                    : replyTo.message_type === "image"
                    ? "Image"
                    : replyTo.message_type === "gif"
                    ? "GIF"
                    : replyTo.content}
                </Text>
              </View>

              <Pressable onPress={() => setReplyTo(null)} style={styles.cancelReply}>
                <Text style={styles.cancelReplyText}>×</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.composer}>
            <Pressable
              onPress={pickChatMedia}
              disabled={uploadingMedia}
              style={styles.mediaButton}
            >
              <Text style={styles.mediaButtonText}>{uploadingMedia ? "…" : "＋"}</Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <AppInput
                placeholder="Message..."
                value={content}
                onChangeText={handleContentChange}
              />
            </View>

            <Pressable onPress={sendMessage} style={styles.sendButton}>
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </>
      )}

      {activeTab === "tasks" && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <View style={styles.card}>
            <View style={styles.groupPlanHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Group tasks</Text>
                <Text style={styles.muted}>
                  {completedTasks.length}/{tasks.length} complete • {progress}%
                </Text>
              </View>

              <Pressable
                onPress={() => router.push("/create-plan")}
                style={styles.createMiniButton}
              >
                <Text style={styles.createMiniText}>＋ Add</Text>
              </Pressable>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                Tasks are created with the middle + button. Tap a task in Plans to
                edit it.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Open</Text>

            {openTasks.length === 0 ? (
              <Text style={styles.emptyText}>No open tasks for this group.</Text>
            ) : (
              openTasks.map((task) => {
                const own = task.creator_id === user.id;

                return (
                  <Pressable
                    key={task.id}
                    onPress={() => router.push("/planner")}
                    style={styles.rowCard}
                  >
                    <View
                      style={[
                        styles.planDot,
                        { backgroundColor: task.color || "#2DD4BF" },
                      ]}
                    />

                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{task.title}</Text>

                      <Text style={styles.muted}>
                        {formatPlanDate(task.due_at)}
                        {task.due_time
                          ? ` • ${formatStoredTime(task.due_time)}`
                          : " • No time"}
                      </Text>

                      <View style={styles.pillRow}>
                        <Text style={styles.pill}>Group task</Text>
                        <Text style={styles.pill}>{renderPlanOwner(task)}</Text>
                        <Text
                          style={[
                            styles.pill,
                            own ? styles.editablePill : styles.viewOnlyPill,
                          ]}
                        >
                          {own ? "Edit in Plans" : "View only"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.arrowText}>›</Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Completed</Text>

            {completedTasks.length === 0 ? (
              <Text style={styles.emptyText}>No completed tasks yet.</Text>
            ) : (
              completedTasks.map((task) => {
                const own = task.creator_id === user.id;

                return (
                  <Pressable
                    key={task.id}
                    onPress={() => router.push("/planner")}
                    style={styles.rowCard}
                  >
                    <View
                      style={[
                        styles.planDot,
                        { backgroundColor: task.color || "#2DD4BF" },
                      ]}
                    />

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, styles.completedText]}>
                        {task.title}
                      </Text>

                      <Text style={styles.muted}>{renderPlanOwner(task)}</Text>

                      <View style={styles.pillRow}>
                        <Text style={styles.pill}>Done</Text>
                        <Text
                          style={[
                            styles.pill,
                            own ? styles.editablePill : styles.viewOnlyPill,
                          ]}
                        >
                          {own ? "Edit in Plans" : "View only"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.arrowText}>›</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === "calendar" && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <View style={styles.card}>
            <View style={styles.groupPlanHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Group calendar</Text>
                <Text style={styles.muted}>
                  {events.length} event{events.length === 1 ? "" : "s"} planned
                </Text>
              </View>

              <Pressable
                onPress={() => router.push("/create-plan")}
                style={styles.createMiniButton}
              >
                <Text style={styles.createMiniText}>＋ Add</Text>
              </Pressable>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                Events are created with the middle + button. Tap an event in Plans to
                edit it.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Upcoming</Text>

            {events.length === 0 ? (
              <Text style={styles.emptyText}>Nothing planned for this group yet.</Text>
            ) : (
              events.map((event) => {
                const own = event.creator_id === user.id;

                return (
                  <Pressable
                    key={event.id}
                    onPress={() => router.push("/planner")}
                    style={styles.rowCard}
                  >
                    <View
                      style={[
                        styles.planDot,
                        { backgroundColor: event.color || "#7C5CFF" },
                      ]}
                    />

                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>📅 {event.title}</Text>

                      <Text style={styles.muted}>
                        {formatPlanDate(event.starts_at)}
                        {event.is_all_day
                          ? " • All day"
                          : event.start_time
                          ? ` • ${formatStoredTime(event.start_time)}${
                              event.end_time
                                ? ` - ${formatStoredTime(event.end_time)}`
                                : ""
                            }`
                          : " • No time"}
                      </Text>

                      {!!event.description && (
                        <Text numberOfLines={2} style={styles.planDescription}>
                          {event.description}
                        </Text>
                      )}

                      <View style={styles.pillRow}>
                        <Text style={styles.pill}>Group event</Text>
                        <Text style={styles.pill}>{renderPlanOwner(event)}</Text>
                        <Text
                          style={[
                            styles.pill,
                            own ? styles.editablePill : styles.viewOnlyPill,
                          ]}
                        >
                          {own ? "Edit in Plans" : "View only"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.arrowText}>›</Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      {activeTab === "members" && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Online now</Text>

            {onlineMembers.length === 0 ? (
              <Text style={styles.emptyText}>Nobody else is online right now.</Text>
            ) : (
              onlineMembers.map((member) => (
                <View key={`online-${member.id}`} style={styles.memberRow}>
                  <Pressable onPress={() => setProfilePreview(member.profiles)}>
                    <ProfileAvatar
                      profile={member.profiles}
                      size={42}
                      showOnline
                      online
                    />
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {displayName(member.profiles)}
                    </Text>

                    <Text style={styles.muted}>Online now</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Availability today</Text>

            {members.map((member) => {
              const count = memberBusyCount(member.user_id);
              const online = onlineIds.includes(member.user_id);

              return (
                <View key={`availability-${member.id}`} style={styles.memberRow}>
                  <Pressable onPress={() => setProfilePreview(member.profiles)}>
                    <ProfileAvatar
                      profile={member.profiles}
                      size={42}
                      showOnline
                      online={online}
                    />
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {displayName(member.profiles)}
                    </Text>

                    <Text style={styles.muted}>
                      {count > 0
                        ? `Busy with ${count} shared plan${count === 1 ? "" : "s"} today`
                        : "Looks free based on shared group calendar"}
                    </Text>

                    {!!member.profiles?.availability_note && (
                      <Text style={styles.availabilityNote}>
                        {member.profiles.availability_note}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Members</Text>

            {members.map((member) => {
              const online = onlineIds.includes(member.user_id);

              return (
                <View key={member.id} style={styles.memberRow}>
                  <Pressable onPress={() => setProfilePreview(member.profiles)}>
                    <ProfileAvatar
                      profile={member.profiles}
                      size={42}
                      showOnline
                      online={online}
                    />
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>
                      {displayName(member.profiles)}
                    </Text>

                    <Text style={styles.muted}>{member.role || "member"}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Invite someone</Text>

            <View style={styles.inviteRow}>
              <AppInput
                placeholder="Username"
                value={inviteUsername}
                onChangeText={(value) => {
                  setInviteUsername(value);
                  setInviteMessage("");
                }}
              />

              <Pressable style={styles.inviteButton} onPress={inviteUser}>
                <Text style={styles.inviteText}>Invite</Text>
              </Pressable>
            </View>

            {!!inviteMessage && (
              <View
                style={[
                  styles.inlineMessage,
                  inviteMessageType === "success"
                    ? styles.inlineSuccess
                    : styles.inlineError,
                ]}
              >
                <Text style={styles.inlineMessageText}>{inviteMessage}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={!!selectedMedia} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Pressable
            onPress={() => setSelectedMedia(null)}
            style={styles.modalClose}
          >
            <Text style={styles.modalCloseText}>×</Text>
          </Pressable>

          {!!selectedMedia?.media_url && (
            <Image
              source={{ uri: selectedMedia.media_url }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <Modal visible={!!actionMessage} transparent animationType="fade">
        <Pressable
          onPress={() => setActionMessage(null)}
          style={styles.actionBackdrop}
        >
          <Pressable style={styles.actionSheet}>
            <Text style={styles.actionTitle}>Message options</Text>

            <View style={styles.reactionPicker}>
              {reactionEmojis.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    toggleReaction(actionMessage, emoji);
                    setActionMessage(null);
                  }}
                  style={styles.reactionButton}
                >
                  <Text style={styles.reactionButtonText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {!actionMessage?.deleted_at && (
              <Pressable
                onPress={() => {
                  setReplyTo(actionMessage);
                  setActionMessage(null);
                }}
                style={styles.actionItem}
              >
                <Text style={styles.actionItemText}>Reply</Text>
              </Pressable>
            )}

            {!!actionMessage?.content && !actionMessage?.deleted_at && (
              <Pressable
                onPress={() => copyMessage(actionMessage)}
                style={styles.actionItem}
              >
                <Text style={styles.actionItemText}>Copy text</Text>
              </Pressable>
            )}

            {actionMessage?.sender_id === user?.id && !actionMessage?.deleted_at && (
              <Pressable
                onPress={() => deleteMessage(actionMessage)}
                style={styles.dangerActionItem}
              >
                <Text style={styles.dangerActionText}>Delete message</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!profilePreview} transparent animationType="fade">
        <Pressable
          onPress={() => setProfilePreview(null)}
          style={styles.actionBackdrop}
        >
          <Pressable style={styles.profileCard}>
            <ProfileAvatar profile={profilePreview} size={74} showOnline online />

            <Text style={styles.profileCardName}>{displayName(profilePreview)}</Text>

            <Text style={styles.profileCardUsername}>
              @{profilePreview?.username || "user"}
            </Text>

            {!!profilePreview?.bio && (
              <Text style={styles.profileCardBio}>{profilePreview.bio}</Text>
            )}

            {!!profilePreview?.availability_note && (
              <Text style={styles.profileCardBio}>
                {profilePreview.availability_note}
              </Text>
            )}

            <Pressable
              onPress={() => setProfilePreview(null)}
              style={styles.profileCloseButton}
            >
              <Text style={styles.profileCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  header: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: colors.bg2,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...shadow,
  },

  backButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  backButtonText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    marginTop: -4,
  },

  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
  },

  muted: {
    color: colors.muted,
    fontWeight: "700",
  },

  settingsButton: {
    backgroundColor: colors.card,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },

  settingsButtonText: {
    color: colors.violet,
    fontWeight: "900",
    fontSize: 15,
  },

  leaveButton: {
    backgroundColor: colors.redSoft,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.45)",
  },

  leaveText: {
    color: colors.red,
    fontWeight: "900",
    fontSize: 12,
  },

  notice: {
    backgroundColor: colors.greenSoft,
    borderBottomWidth: 1,
    borderColor: "rgba(45,212,191,0.4)",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },

  noticeText: {
    color: colors.text,
    fontWeight: "900",
  },

  tabs: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: colors.bg2,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },

  tab: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  activeTab: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },

  tabText: {
    color: colors.muted,
    fontWeight: "900",
    textTransform: "capitalize",
    fontSize: 12,
  },

  activeTabText: {
    color: colors.text,
  },

  messages: {
    padding: 16,
    paddingBottom: 30,
  },

  dateDivider: {
    alignSelf: "center",
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  dateDividerText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "900",
  },

  messageRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 8,
  },

  myMessageRow: {
    justifyContent: "flex-end",
  },

  tightMessage: {
    marginBottom: 3,
  },

  leftAvatarSlot: {
    width: 40,
    alignItems: "center",
  },

  messageStack: {
    maxWidth: "76%",
  },

  bubble: {
    minWidth: 42,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 1,
  },

  mediaBubble: {
    padding: 4,
    overflow: "hidden",
    backgroundColor: "transparent",
  },

  theirBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
    ...shadow,
    shadowOpacity: 0.16,
    elevation: 2,
  },

  myBubble: {
    backgroundColor: colors.violet,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.35)",
    ...shadow,
    shadowOpacity: 0.18,
  },

  deletedBubble: {
    opacity: 0.62,
    backgroundColor: colors.card2,
  },

  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    flexShrink: 1,
    flexWrap: "wrap",
    fontWeight: "700",
  },

  myMessageText: {
    color: colors.text,
  },

  deletedText: {
    color: colors.muted,
    fontStyle: "italic",
    fontWeight: "800",
  },

  revealedTime: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginHorizontal: 4,
    marginBottom: 6,
  },

  sendingText: {
    color: "rgba(248,250,252,0.78)",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 4,
  },

  linkText: {
    color: colors.green,
    fontWeight: "900",
  },

  myLinkText: {
    color: colors.text,
  },

  urlText: {
    color: colors.lavender,
    fontSize: 12,
    textDecorationLine: "underline",
    fontWeight: "700",
  },

  myUrlText: {
    color: "rgba(248,250,252,0.88)",
  },

  mediaWrap: {
    position: "relative",
  },

  chatImage: {
    width: 230,
    height: 230,
    borderRadius: 19,
    backgroundColor: colors.card,
  },

  gifBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },

  gifBadgeText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 11,
  },

  replyPreview: {
    borderLeftWidth: 3,
    borderLeftColor: colors.violet,
    paddingLeft: 8,
    marginBottom: 7,
  },

  replyPreviewMine: {
    borderLeftColor: "rgba(248,250,252,0.72)",
  },

  replyName: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 12,
  },

  replyNameMine: {
    color: colors.text,
  },

  replyText: {
    color: colors.text2,
    fontSize: 12,
    fontWeight: "700",
  },

  replyTextMine: {
    color: "rgba(248,250,252,0.82)",
  },

  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 4,
  },

  reactionPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },

  reactionPillMine: {
    borderColor: colors.violet,
    backgroundColor: colors.violetSoft,
  },

  reactionText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 12,
  },

  typingBar: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    backgroundColor: colors.bg2,
    borderTopWidth: 1,
    borderColor: colors.border,
  },

  typingText: {
    color: colors.green,
    fontWeight: "900",
    fontSize: 12,
  },

  replyComposer: {
    backgroundColor: colors.bg2,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  replyComposerLabel: {
    color: colors.violet,
    fontWeight: "900",
    fontSize: 12,
  },

  replyComposerText: {
    color: colors.text,
    fontWeight: "800",
  },

  cancelReply: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  cancelReplyText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 18,
  },

  composer: {
    padding: 12,
    gap: 9,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg2,
    flexDirection: "row",
    alignItems: "center",
  },

  mediaButton: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  mediaButtonText: {
    color: colors.violet,
    fontSize: 28,
    fontWeight: "700",
    marginTop: -3,
  },

  sendButton: {
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 46,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.violet,
    ...shadow,
    shadowOpacity: 0.18,
  },

  sendButtonText: {
    color: colors.text,
    fontWeight: "900",
  },

  panel: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  panelContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: 16,
    gap: 12,
    ...shadow,
  },

  sectionTitle: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.3,
  },

  smallLabel: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 13,
  },

  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: colors.bg2,
    ...shadow,
    shadowOpacity: 0.12,
  },

  selectedColorDot: {
    borderColor: colors.text,
    transform: [{ scale: 1.08 }],
  },

  progressTrack: {
    height: 10,
    backgroundColor: colors.card,
    borderRadius: 999,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: colors.green,
  },

  rowCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },

  planDot: {
    width: 13,
    height: 13,
    borderRadius: 999,
  },

  rowTitle: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16,
  },

  completedText: {
    textDecorationLine: "line-through",
    opacity: 0.55,
  },

  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },

  pill: {
    color: colors.text2,
    backgroundColor: colors.bg2,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },

  editablePill: {
    color: colors.green,
    backgroundColor: colors.greenSoft,
    borderColor: "rgba(45,212,191,0.45)",
  },

  viewOnlyPill: {
    color: colors.violet,
    backgroundColor: colors.violetSoft,
    borderColor: "rgba(124,92,255,0.45)",
  },

  doneButton: {
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  doneText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 12,
  },

  deleteButton: {
    backgroundColor: colors.redSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.45)",
  },

  deleteText: {
    color: colors.red,
    fontWeight: "900",
    fontSize: 15,
  },

  toggle: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },

  toggleActive: {
    backgroundColor: colors.greenSoft,
    borderColor: "rgba(45,212,191,0.45)",
  },

  toggleText: {
    color: colors.text,
    fontWeight: "900",
  },

  memberRow: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  memberName: {
    color: colors.text,
    fontWeight: "900",
  },

  availabilityNote: {
    color: colors.green,
    marginTop: 4,
    fontWeight: "800",
  },

  inviteRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },

  inviteButton: {
    backgroundColor: colors.violet,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 999,
  },

  inviteText: {
    color: colors.text,
    fontWeight: "900",
  },

  inlineMessage: {
    borderRadius: 16,
    padding: 12,
  },

  inlineError: {
    backgroundColor: colors.redSoft,
    borderColor: "rgba(251,113,133,0.45)",
    borderWidth: 1,
  },

  inlineSuccess: {
    backgroundColor: colors.greenSoft,
    borderColor: "rgba(45,212,191,0.45)",
    borderWidth: 1,
  },

  inlineMessageText: {
    color: colors.text,
    fontWeight: "800",
  },

  emptyText: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 20,
    fontWeight: "700",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  modalClose: {
    position: "absolute",
    right: 18,
    top: 48,
    zIndex: 3,
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCloseText: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "900",
  },

  fullscreenImage: {
    width: "100%",
    height: "82%",
  },

  actionBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },

  actionSheet: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.bg2,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    ...shadow,
  },

  actionTitle: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: "900",
  },

  reactionPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },

  reactionButton: {
    flex: 1,
    height: 46,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },

  reactionButtonText: {
    fontSize: 22,
  },

  actionItem: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },

  actionItemText: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "center",
  },

  dangerActionItem: {
    backgroundColor: colors.redSoft,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.45)",
  },

  dangerActionText: {
    color: colors.red,
    fontWeight: "900",
    textAlign: "center",
  },

  profileCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.bg2,
    borderRadius: 30,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: 10,
    ...shadow,
  },

  profileCardName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
  },

  profileCardUsername: {
    color: colors.violet,
    fontWeight: "900",
  },

  profileCardBio: {
    color: colors.text2,
    textAlign: "center",
    lineHeight: 21,
    fontWeight: "700",
  },

  profileCloseButton: {
    marginTop: 8,
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },

  profileCloseText: {
    color: colors.text,
    fontWeight: "900",
  },

  groupPlanHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  createMiniButton: {
    backgroundColor: colors.violet,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.violet,
    ...shadow,
    shadowOpacity: 0.14,
  },

  createMiniText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 13,
  },

  infoBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 13,
  },

  infoBoxText: {
    color: colors.text2,
    fontWeight: "800",
    lineHeight: 20,
  },

  arrowText: {
    color: colors.violet,
    fontSize: 30,
    fontWeight: "900",
  },

  planDescription: {
    color: colors.text2,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 20,
  },

});