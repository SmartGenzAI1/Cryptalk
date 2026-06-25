import 'dart:convert';

class AppUser {
  final String id;
  final String? email;
  final String? username;
  final String? name;
  final String bio;
  final String avatarColor;
  final String avatarEmoji;
  final bool isOnline;
  final bool isOnboarded;
  final String? lastSeen;
  final String accentColor;
  final String wallpaper;
  final bool hasE2EEKeys;

  AppUser({
    required this.id,
    this.email,
    this.username,
    this.name,
    this.bio = '',
    this.avatarColor = 'emerald',
    this.avatarEmoji = 'fox',
    this.isOnline = false,
    this.isOnboarded = false,
    this.lastSeen,
    this.accentColor = 'emerald',
    this.wallpaper = 'dots',
    this.hasE2EEKeys = false,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] ?? '',
      email: json['email'],
      username: json['username'],
      name: json['name'],
      bio: json['bio'] ?? '',
      avatarColor: json['avatarColor'] ?? 'emerald',
      avatarEmoji: json['avatarEmoji'] ?? 'fox',
      isOnline: json['isOnline'] ?? false,
      isOnboarded: json['isOnboarded'] ?? false,
      lastSeen: json['lastSeen'],
      accentColor: json['accentColor'] ?? 'emerald',
      wallpaper: json['wallpaper'] ?? 'dots',
      hasE2EEKeys: json['hasE2EEKeys'] ?? false,
    );
  }
}

class Chat {
  final String id;
  final String type;
  final String title;
  final String description;
  final String avatarColor;
  final String avatarEmoji;
  final String createdBy;
  final String createdAt;
  final String updatedAt;
  final String? expiresAt;
  final int unreadCount;
  final List<ChatMember> members;
  final LastMessage? lastMessage;

  Chat({
    required this.id,
    required this.type,
    required this.title,
    this.description = '',
    this.avatarColor = 'emerald',
    this.avatarEmoji = 'chat',
    this.createdBy = '',
    this.createdAt = '',
    this.updatedAt = '',
    this.expiresAt,
    this.unreadCount = 0,
    this.members = const [],
    this.lastMessage,
  });

  factory Chat.fromJson(Map<String, dynamic> json) {
    return Chat(
      id: json['id'] ?? '',
      type: json['type'] ?? 'direct',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      avatarColor: json['avatarColor'] ?? 'emerald',
      avatarEmoji: json['avatarEmoji'] ?? 'chat',
      createdBy: json['createdBy'] ?? '',
      createdAt: json['createdAt'] ?? '',
      updatedAt: json['updatedAt'] ?? '',
      expiresAt: json['expiresAt'],
      unreadCount: json['unreadCount'] ?? 0,
      members: (json['members'] as List?)?.map((m) => ChatMember.fromJson(m)).toList() ?? [],
      lastMessage: json['lastMessage'] != null ? LastMessage.fromJson(json['lastMessage']) : null,
    );
  }
}

class ChatMember {
  final String id;
  final String role;
  final AppUser user;
  final String lastReadAt;

  ChatMember({
    required this.id,
    this.role = 'member',
    required this.user,
    this.lastReadAt = '',
  });

  factory ChatMember.fromJson(Map<String, dynamic> json) {
    return ChatMember(
      id: json['id'] ?? '',
      role: json['role'] ?? 'member',
      user: AppUser.fromJson(json['user'] ?? {}),
      lastReadAt: json['lastReadAt'] ?? '',
    );
  }
}

class LastMessage {
  final String id;
  final String content;
  final String type;
  final String createdAt;
  final String senderId;
  final String senderName;

  LastMessage({
    required this.id,
    this.content = '',
    this.type = 'text',
    this.createdAt = '',
    this.senderId = '',
    this.senderName = '',
  });

  factory LastMessage.fromJson(Map<String, dynamic> json) {
    return LastMessage(
      id: json['id'] ?? '',
      content: json['content'] ?? '',
      type: json['type'] ?? 'text',
      createdAt: json['createdAt'] ?? '',
      senderId: json['senderId'] ?? '',
      senderName: json['senderName'] ?? '',
    );
  }
}

class Message {
  final String id;
  final String chatId;
  final String senderId;
  String content;
  final String type;
  final String? replyToId;
  final String? editedAt;
  final String createdAt;
  final String? deletedAt;
  final int? duration;
  final int? expiresIn;
  final String status;
  final bool starred;
  final AppUser sender;
  final List<Reaction> reactions;
  // supabase storage path from /api/uploads (null on dev fallback or after
  // server wipes the attachment on delivery)
  final String? attachmentPath;

  Message({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.content,
    this.type = 'text',
    this.replyToId,
    this.editedAt,
    required this.createdAt,
    this.deletedAt,
    this.duration,
    this.expiresIn,
    this.status = 'sent',
    this.starred = false,
    required this.sender,
    this.reactions = const [],
    this.attachmentPath,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] ?? '',
      chatId: json['chatId'] ?? '',
      senderId: json['senderId'] ?? '',
      content: json['content'] ?? '',
      type: json['type'] ?? 'text',
      replyToId: json['replyToId'],
      editedAt: json['editedAt'],
      createdAt: json['createdAt'] ?? '',
      deletedAt: json['deletedAt'],
      duration: json['duration'],
      expiresIn: json['expiresIn'],
      status: json['status'] ?? 'sent',
      starred: json['starred'] ?? false,
      sender: AppUser.fromJson(json['sender'] ?? {}),
      reactions: (json['reactions'] as List?)?.map((r) => Reaction.fromJson(r)).toList() ?? [],
      attachmentPath: json['attachmentPath'] ?? json['attachment_path'],
    );
  }
}

class Reaction {
  final String id;
  final String emoji;
  final AppUser user;

  Reaction({required this.id, required this.emoji, required this.user});

  factory Reaction.fromJson(Map<String, dynamic> json) {
    return Reaction(
      id: json['id'] ?? '',
      emoji: json['emoji'] ?? '',
      user: AppUser.fromJson(json['user'] ?? {}),
    );
  }
}

class ConnectionRequest {
  final String id;
  final AppUser from;
  final int createdAt;

  ConnectionRequest({required this.id, required this.from, required this.createdAt});

  factory ConnectionRequest.fromJson(Map<String, dynamic> json) {
    return ConnectionRequest(
      id: json['id'] ?? '',
      from: AppUser.fromJson(json['from'] ?? {}),
      createdAt: json['createdAt'] ?? 0,
    );
  }
}
