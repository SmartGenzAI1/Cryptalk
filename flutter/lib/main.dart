import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/api_config.dart';
import 'core/auth_service.dart';
import 'core/socket_service.dart';
import 'core/chat_service.dart';
import 'core/crypto_service.dart';
import 'app_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');

  ApiConfig.baseUrl = dotenv.env['BACKEND_URL'] ?? 'http://10.0.2.2:8001';

  if (ApiConfig.hasSupabase) {
    await Supabase.initialize(
      url: ApiConfig.supabaseUrl!,
      anonKey: ApiConfig.supabaseAnonKey!,
    );
  }

  runApp(CryptalkApp());
}

const Map<String, Color> accentColors = {
  'emerald': Color(0xFF10B981),
  'violet': Color(0xFF8B5CF6),
  'rose': Color(0xFFF43F5E),
  'amber': Color(0xFFF59E0B),
  'cyan': Color(0xFF06B6D4),
  'lime': Color(0xFF84CC16),
  'purple': Color(0xFFA855F7),
  'teal': Color(0xFF14B8A6),
};

class CryptalkApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthService()),
        Provider(create: (_) => ChatService()),
        Provider(create: (_) => SocketService()),
        Provider(create: (_) => CryptoService()),
      ],
      child: Consumer<AuthService>(
        builder: (context, auth, _) {
          final user = auth.currentUser;
          final accentKey = user?.accentColor ?? 'emerald';
          final accentColor = accentColors[accentKey] ?? const Color(0xFF10B981);

          return MaterialApp(
            title: 'Cryptalk',
            debugShowCheckedModeBanner: false,
            themeMode: auth.themeMode,
            theme: ThemeData(
              brightness: Brightness.light,
              colorScheme: ColorScheme.fromSeed(
                seedColor: accentColor,
                brightness: Brightness.light,
                background: const Color(0xFFF7FCF9),
                surface: Colors.white,
                surfaceContainerLow: Colors.grey[100],
                surfaceContainer: Colors.grey[50],
              ),
              scaffoldBackgroundColor: const Color(0xFFF7FCF9),
              cardColor: Colors.white,
              appBarTheme: const AppBarTheme(
                backgroundColor: Color(0xFFF7FCF9),
                elevation: 0,
              ),
              useMaterial3: true,
            ),
            darkTheme: ThemeData(
              brightness: Brightness.dark,
              colorScheme: ColorScheme.fromSeed(
                seedColor: accentColor,
                brightness: Brightness.dark,
                background: const Color(0xFF0F171A),
                surface: const Color(0xFF152226),
                surfaceContainerLow: const Color(0xFF152226),
                surfaceContainer: const Color(0xFF152226),
              ),
              scaffoldBackgroundColor: const Color(0xFF0F171A),
              cardColor: const Color(0xFF152226),
              appBarTheme: const AppBarTheme(
                backgroundColor: Color(0xFF0F171A),
                elevation: 0,
              ),
              useMaterial3: true,
            ),
            home: const AppRouter(),
          );
        },
      ),
    );
  }
}
