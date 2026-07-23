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

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      if (email != null) 'email': email,
      if (username != null) 'username': username,
      if (name != null) 'name': name,
      'bio': bio,
      'avatarColor': avatarColor,
      'avatarEmoji': avatarEmoji,
      'isOnline': isOnline,
      'isOnboarded': isOnboarded,
      if (lastSeen != null) 'lastSeen': lastSeen,
      'accentColor': accentColor,
      'wallpaper': wallpaper,
      'hasE2EEKeys': hasE2EEKeys,
    };
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
  final String? chatKey;
  final String? pinnedAt;
  final bool muted;

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
    this.chatKey,
    this.pinnedAt,
    this.muted = false,
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
      chatKey: json['chatKey'] ?? json['chat_key'],
      pinnedAt: json['pinnedAt'] ?? json['pinned_at'],
      muted: json['muted'] ?? false,
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
  final String status;

  LastMessage({
    required this.id,
    this.content = '',
    this.type = 'text',
    this.createdAt = '',
    this.senderId = '',
    this.senderName = '',
    this.status = 'sent',
  });

  factory LastMessage.fromJson(Map<String, dynamic> json) {
    return LastMessage(
      id: json['id'] ?? '',
      content: json['content'] ?? '',
      type: json['type'] ?? 'text',
      createdAt: json['createdAt'] ?? '',
      senderId: json['senderId'] ?? '',
      senderName: json['senderName'] ?? '',
      status: json['status'] ?? 'sent',
    );
  }
}

class ReplyTo {
  final String id;
  final String content;
  final String type;
  final String senderId;
  final String senderName;

  ReplyTo({
    required this.id,
    this.content = '',
    this.type = 'text',
    this.senderId = '',
    this.senderName = '',
  });

  factory ReplyTo.fromJson(Map<String, dynamic> json) {
    String senderName = json['senderName'] ?? json['sender_name'] ?? '';
    if (senderName.isEmpty && json['sender'] != null && json['sender'] is Map) {
      senderName = json['sender']['name'] ?? json['sender']['username'] ?? '';
    }
    return ReplyTo(
      id: json['id'] ?? '',
      content: json['content'] ?? '',
      type: json['type'] ?? 'text',
      senderId: json['senderId'] ?? json['sender_id'] ?? (json['sender'] is Map ? (json['sender']['id'] ?? '') : ''),
      senderName: senderName,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'content': content,
      'type': type,
      'senderId': senderId,
      'senderName': senderName,
    };
  }
}

class Message {
  final String id;
  final String chatId;
  final String senderId;
  String content;
  final String type;
  final String? replyToId;
  final ReplyTo? replyTo;
  final String? editedAt;
  final String createdAt;
  final String? deletedAt;
  final int? duration;
  final int? expiresIn;
  // 5-stage status: 'pending', 'sent', 'delivered', 'read', 'failed'
  String status;
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
    this.replyTo,
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
    final rawReplyTo = json['replyTo'] ?? json['reply_to'];
    return Message(
      id: json['id'] ?? '',
      chatId: json['chatId'] ?? json['chat_id'] ?? '',
      senderId: json['senderId'] ?? json['sender_id'] ?? '',
      content: json['content'] ?? '',
      type: json['type'] ?? 'text',
      replyToId: json['replyToId'] ?? json['reply_to_id'],
      replyTo: rawReplyTo != null ? ReplyTo.fromJson(Map<String, dynamic>.from(rawReplyTo)) : null,
      editedAt: json['editedAt'] ?? json['edited_at'],
      createdAt: json['createdAt'] ?? json['created_at'] ?? '',
      deletedAt: json['deletedAt'] ?? json['deleted_at'],
      duration: json['duration'] != null ? (json['duration'] as num).toInt() : null,
      expiresIn: json['expiresIn'] ?? json['expires_in'],
      status: json['status'] ?? 'sent',
      starred: json['starred'] ?? false,
      sender: AppUser.fromJson(json['sender'] ?? {}),
      reactions: (json['reactions'] as List?)?.map((r) => Reaction.fromJson(r)).toList() ?? [],
      attachmentPath: json['attachmentPath'] ?? json['attachment_path'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'chatId': chatId,
      'senderId': senderId,
      'content': content,
      'type': type,
      if (replyToId != null) 'replyToId': replyToId,
      if (replyTo != null) 'replyTo': replyTo!.toJson(),
      if (editedAt != null) 'editedAt': editedAt,
      'createdAt': createdAt,
      if (deletedAt != null) 'deletedAt': deletedAt,
      if (duration != null) 'duration': duration,
      if (expiresIn != null) 'expiresIn': expiresIn,
      'status': status,
      'starred': starred,
      'sender': sender.toJson(),
      'reactions': reactions.map((r) => r.toJson()).toList(),
      if (attachmentPath != null) 'attachmentPath': attachmentPath,
    };
  }

  Message copyWith({
    String? id,
    String? chatId,
    String? senderId,
    String? content,
    String? type,
    String? replyToId,
    ReplyTo? replyTo,
    String? editedAt,
    String? createdAt,
    String? deletedAt,
    int? duration,
    int? expiresIn,
    String? status,
    bool? starred,
    AppUser? sender,
    List<Reaction>? reactions,
    String? attachmentPath,
  }) {
    return Message(
      id: id ?? this.id,
      chatId: chatId ?? this.chatId,
      senderId: senderId ?? this.senderId,
      content: content ?? this.content,
      type: type ?? this.type,
      replyToId: replyToId ?? this.replyToId,
      replyTo: replyTo ?? this.replyTo,
      editedAt: editedAt ?? this.editedAt,
      createdAt: createdAt ?? this.createdAt,
      deletedAt: deletedAt ?? this.deletedAt,
      duration: duration ?? this.duration,
      expiresIn: expiresIn ?? this.expiresIn,
      status: status ?? this.status,
      starred: starred ?? this.starred,
      sender: sender ?? this.sender,
      reactions: reactions ?? this.reactions,
      attachmentPath: attachmentPath ?? this.attachmentPath,
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

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'emoji': emoji,
      'user': user.toJson(),
    };
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
