import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'core/api_config.dart';
import 'core/auth_service.dart';
import 'core/socket_service.dart';
import 'core/chat_service.dart';
import 'core/crypto_service.dart';
import 'app_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');

  final backendUrl = dotenv.env['BACKEND_URL'] ?? 'http://10.0.2.2:8001';
  ApiConfig.baseUrl = backendUrl;

  runApp(CryptalkApp());
}

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
      child: MaterialApp(
        title: 'Cryptalk',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          brightness: Brightness.dark,
          colorSchemeSeed: const Color(0xFF10b981),
          useMaterial3: true,
          fontFamily: 'Roboto',
        ),
        home: const AppRouter(),
      ),
    );
  }
}
