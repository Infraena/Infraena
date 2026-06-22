import "package:flutter/material.dart";
void main() => runApp(const MyApp());
class MyApp extends StatelessWidget {
  const MyApp({super.key});
  Widget build(BuildContext context) => MaterialApp(home: Scaffold(body: Center(child: Text("{{serviceName}}"))));
}
