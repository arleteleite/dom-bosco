"""Servidor local do piloto Dom Bosco.

Igual ao "python -m http.server", com duas diferenças que evitam a tela em branco:
  1. manda "Cache-Control: no-store", para o navegador NUNCA reaproveitar arquivo antigo do piloto
     (sem isso, depois de uma atualização ele pode juntar arquivos velhos com novos e a página não abre);
  2. diz que .js é JavaScript, mesmo em computadores Windows com o tipo configurado errado.

Uso: python servidor.py [porta]   (o iniciar.bat já faz isso)
"""
import http.server
import os
import socketserver
import sys


class Atendente(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


os.chdir(os.path.dirname(os.path.abspath(__file__)))
porta = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', porta), Atendente) as servidor:
    servidor.serve_forever()
