import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/chat_service.dart';
import '../../core/models.dart';
import '../../core/ui/avatar.dart';

/// Three-tab connections screen: Find (search + add), Requests (incoming),
/// Mine (accepted connections). Mobile-first: full-width search bar, 56px
/// touch targets, inline loading + empty states, no useless modals.
///
/// Each tab owns its own data so they refresh independently — the parent is
/// just a tab shell. The Requests tab pushes its current count into the
/// shared [ValueNotifier] so the AppBar badge can reflect it without
/// rebuilding the whole tree.
class ConnectionsScreen extends StatefulWidget {
  const ConnectionsScreen({super.key});

  @override
  State<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends State<ConnectionsScreen> {
  final ValueNotifier<int> _requestCount = ValueNotifier<int>(0);

  @override
  void dispose() {
    _requestCount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Connections'),
          bottom: TabBar(
            tabs: [
              const Tab(icon: Icon(Icons.search), text: 'Find'),
              ValueListenableBuilder<int>(
                valueListenable: _requestCount,
                builder: (context, count, _) => Tab(
                  icon: Badge(
                    isLabelVisible: count > 0,
                    label: Text('$count'),
                    child: const Icon(Icons.notifications_none),
                  ),
                  text: 'Requests',
                ),
              ),
              const Tab(icon: Icon(Icons.people_outline), text: 'Mine'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            const _FindTab(),
            _RequestsTab(countNotifier: _requestCount),
            const _ConnectionsTab(),
          ],
        ),
      ),
    );
  }
}

/// Find tab — search by username + connect.
class _FindTab extends StatefulWidget {
  const _FindTab();

  @override
  State<_FindTab> createState() => _FindTabState();
}

class _FindTabState extends State<_FindTab> {
  final _searchController = TextEditingController();
  List<AppUser> _results = [];
  bool _loading = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    final query = q.trim();
    if (query.isEmpty) {
      if (mounted) setState(() => _results = []);
      return;
    }
    if (mounted) setState(() => _loading = true);
    try {
      final results = await context.read<ChatService>().searchUsers(query);
      if (mounted) setState(() => _results = results);
    } catch (_) {
      if (mounted) setState(() => _results = []);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _connect(String username) async {
    if (username.isEmpty) return;
    final api = context.read<ChatService>().api;
    try {
      await api.post('/api/social/connect', {'to_username': username});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Request sent to @$username'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Failed: ${e.toString().replaceFirst('Exception: ', '')}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchController,
            onChanged: _search,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Search by username...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchController.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear',
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        _search('');
                      },
                    ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
            ),
          ),
        ),
        if (_loading)
          const Expanded(child: Center(child: CircularProgressIndicator()))
        else if (_results.isEmpty)
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.person_search,
                        size: 72, color: Colors.grey[500]),
                    const SizedBox(height: 16),
                    Text(
                      'Find people',
                      style: TextStyle(
                        color: Colors.grey[400],
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Search by username to send a connection request.',
                      style: TextStyle(color: Colors.grey[500]),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          Expanded(
            child: ListView.separated(
              itemCount: _results.length,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, indent: 76),
              itemBuilder: (context, index) {
                final u = _results[index];
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 4),
                  leading: AvatarIcon(
                    iconKey: u.avatarEmoji,
                    colorName: u.avatarColor,
                    size: 48,
                  ),
                  title: Text(
                    u.name ?? 'Unknown',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    '@${u.username ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: FilledButton.tonalIcon(
                    onPressed: (u.username?.isEmpty ?? true)
                        ? null
                        : () => _connect(u.username!),
                    icon: const Icon(Icons.person_add_outlined),
                    label: const Text('Connect'),
                  ),
                );
              },
            ),
          ),
      ],
    );
  }
}

/// Requests tab — incoming connection requests. Pushes the current count
/// into [countNotifier] so the parent AppBar badge can reflect it.
class _RequestsTab extends StatefulWidget {
  final ValueNotifier<int> countNotifier;
  const _RequestsTab({required this.countNotifier});

  @override
  State<_RequestsTab> createState() => _RequestsTabState();
}

class _RequestsTabState extends State<_RequestsTab> {
  List<AppUser> _requests = [];
  List<String> _requestIds = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = context.read<ChatService>().api;
      final data = await api.get('/api/social/requests');
      final list = (data['requests'] as List).cast<Map<String, dynamic>>();
      if (mounted) {
        setState(() {
          _requestIds =
              list.map((r) => (r['id'] ?? '').toString()).toList();
          _requests = list
              .map((r) => AppUser.fromJson(
                  (r['from'] as Map<String, dynamic>?) ?? const {}))
              .toList();
          _loading = false;
        });
        widget.countNotifier.value = _requests.length;
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _accept(String requestId) async {
    if (requestId.isEmpty) return;
    try {
      await context.read<ChatService>().api.post('/api/social/accept/$requestId');
      if (mounted) _load();
    } catch (_) {}
  }

  Future<void> _decline(String requestId) async {
    if (requestId.isEmpty) return;
    try {
      await context.read<ChatService>().api.post('/api/social/decline/$requestId');
      if (mounted) _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_requests.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.inbox_outlined, size: 72, color: Colors.grey[500]),
              const SizedBox(height: 16),
              Text(
                'No pending requests',
                style: TextStyle(color: Colors.grey[400]),
              ),
            ],
          ),
        ),
      );
    }
    return ListView.separated(
      itemCount: _requests.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
      itemBuilder: (context, index) {
        final from = _requests[index];
        final requestId = index < _requestIds.length
            ? _requestIds[index]
            : '';
        return ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: AvatarIcon(
            iconKey: from.avatarEmoji,
            colorName: from.avatarColor,
            size: 48,
          ),
          title: Text(
            from.name ?? 'Unknown',
            style: const TextStyle(fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            '@${from.username ?? ''}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton.filled(
                tooltip: 'Accept',
                onPressed: () => _accept(requestId),
                icon: const Icon(Icons.check),
              ),
              const SizedBox(width: 4),
              IconButton.outlined(
                tooltip: 'Decline',
                onPressed: () => _decline(requestId),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Mine tab — accepted connections.
class _ConnectionsTab extends StatefulWidget {
  const _ConnectionsTab();

  @override
  State<_ConnectionsTab> createState() => _ConnectionsTabState();
}

class _ConnectionsTabState extends State<_ConnectionsTab> {
  List<AppUser> _connections = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = context.read<ChatService>().api;
      final data = await api.get('/api/social/connections');
      if (mounted) {
        setState(() {
          _connections = (data['connections'] as List)
              .map((u) => AppUser.fromJson(u as Map<String, dynamic>))
              .toList();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_connections.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.people_outline, size: 72, color: Colors.grey[500]),
              const SizedBox(height: 16),
              Text(
                'No connections yet',
                style: TextStyle(color: Colors.grey[400]),
              ),
              const SizedBox(height: 8),
              Text(
                'Search for someone to connect with on the Find tab.',
                style: TextStyle(color: Colors.grey[500]),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }
    return ListView.separated(
      itemCount: _connections.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
      itemBuilder: (context, index) {
        final u = _connections[index];
        return ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          leading: AvatarIcon(
            iconKey: u.avatarEmoji,
            colorName: u.avatarColor,
            size: 48,
            online: u.isOnline,
          ),
          title: Text(
            u.name ?? 'Unknown',
            style: const TextStyle(fontWeight: FontWeight.w600),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            '@${u.username ?? ''}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: IconButton(
            tooltip: 'Message',
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: () async {
              try {
                final chatService = context.read<ChatService>();
                await chatService.createDirectChat(u.id);
                if (context.mounted) Navigator.pop(context);
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                          'Failed: ${e.toString().replaceFirst('Exception: ', '')}'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              }
            },
          ),
        );
      },
    );
  }
}
