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
      publishableKey: ApiConfig.supabaseAnonKey!,
    );
  }

  runApp(const CryptalkApp());
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
  const CryptalkApp({super.key});
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
                surface: Colors.white,
                surfaceContainerLow: const Color(0xFFF8FAFC),
                surfaceContainer: const Color(0xFFF1F5F9),
              ),
              scaffoldBackgroundColor: const Color(0xFFF8FAFC),
              cardColor: Colors.white,
              cardTheme: CardThemeData(
                color: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: Color(0xFFE2E8F0), width: 1),
                ),
              ),
              inputDecorationTheme: InputDecorationTheme(
                filled: true,
                fillColor: Colors.white,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: accentColor, width: 1.5),
                ),
              ),
              appBarTheme: const AppBarTheme(
                backgroundColor: Color(0xFFF8FAFC),
                elevation: 0,
                scrolledUnderElevation: 0,
              ),
              useMaterial3: true,
            ),
            darkTheme: ThemeData(
              brightness: Brightness.dark,
              colorScheme: ColorScheme.fromSeed(
                seedColor: accentColor,
                brightness: Brightness.dark,
                surface: const Color(0xFF0F172A),
                surfaceContainerLow: const Color(0xFF1E293B),
                surfaceContainer: const Color(0xFF334155),
              ),
              scaffoldBackgroundColor: const Color(0xFF0B132B),
              cardColor: const Color(0xFF0F172A),
              cardTheme: CardThemeData(
                color: const Color(0xFF0F172A),
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: Color(0xFF1E293B), width: 1),
                ),
              ),
              inputDecorationTheme: InputDecorationTheme(
                filled: true,
                fillColor: const Color(0xFF0F172A),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFF1E293B)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: const BorderSide(color: Color(0xFF1E293B)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide(color: accentColor, width: 1.5),
                ),
              ),
              appBarTheme: const AppBarTheme(
                backgroundColor: Color(0xFF0B132B),
                elevation: 0,
                scrolledUnderElevation: 0,
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
