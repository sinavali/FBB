# tgChannel.py
import logging
import requests
import threading
import time
from datetime import datetime, timedelta
import MetaTrader5 as mt5
from queue import Queue
from decimal import Decimal
from shared import initialize_mt5

class TelegramChannel:
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.last_check_time = datetime.now()
        self.running = True
        self.message_queue = Queue()
        self.failure_count = 0
        self.circuit_open = False
        self._start_processing_thread()
        self.lock = threading.Lock()

    def _start_processing_thread(self):
        def processor():
            while self.running:
                msg = self.message_queue.get()
                self._send_message(msg)
        threading.Thread(target=processor, daemon=True).start()

    def _send_message(self, text: str) -> bool:
        if self.circuit_open:
            return False
            
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            payload = {
                'chat_id': self.chat_id,
                'text': text,
                'parse_mode': 'Markdown'
            }
            response = requests.post(url, data=payload, timeout=5)
            response.raise_for_status()
            self.failure_count = 0
            return True
        except Exception as e:
            self.failure_count += 1
            if self.failure_count > 5:
                self.circuit_open = True
                threading.Timer(300, self._reset_circuit).start()
            logging.error(f"Telegram notification failed: {str(e)}")
            return False

    def _reset_circuit(self):
        self.circuit_open = False
        self.failure_count = 0

    def build_order_message(self, order_type: str, trade_data: dict) -> str:
        try:
            symbol_info = mt5.symbol_info(trade_data['symbol'])
            digits = symbol_info.digits if symbol_info else 5
            fmt = f"%.{digits}f"
            
            base = (f"🎯 *{order_type}*\n"
                    f"• Ticket: #{trade_data['ticket']}\n"
                    f"• Symbol: {trade_data['symbol']}\n"
                    f"• Direction: {trade_data['direction']}\n"
                    f"• Volume: {trade_data['volume']}\n"
                    f"• Price: {fmt % trade_data['price']}\n"
                    f"• SL: {fmt % trade_data['sl']}\n"
                    f"• TP: {fmt % trade_data['tp']}")

            if 'profit' in trade_data:
                base += f"\n• Profit: ${trade_data['profit']:.2f}"
                base += f"\n• R:R Ratio: {trade_data['rr_ratio']}"

            return base
        except Exception as e:
            logging.error(f"Message build error: {str(e)}")
            return "New trading activity detected"

    def on_order_event(self, event_type: str, trade_data: dict):
        event_types = {
            'placed': 'Order Placed',
            'filled': 'Order Filled',
            'closed': 'Position Closed'
        }
        message = self.build_order_message(event_types[event_type], trade_data)
        self.message_queue.put(message)

    def check_closed_positions(self):
        while self.running:
            with self.lock:
                try:
                    # Connection retry logic
                    for _ in range(3):
                        if initialize_mt5():
                            break
                        time.sleep(1)
                    else:
                        continue

                    deals = mt5.history_deals_get(self.last_check_time, datetime.now())
                    if deals:
                        for deal in deals:
                            if deal.entry == mt5.DEAL_ENTRY_OUT:
                                self._process_closed_deal(deal)
                        self.last_check_time = datetime.now()

                except Exception as e:
                    logging.error(f"Position check error: {str(e)}")
                finally:
                    mt5.shutdown()
                    time.sleep(10)

    def _process_closed_deal(self, deal):
        try:
            # Calculate position duration
            duration = deal.time_close - deal.time
            hours, remainder = divmod(duration, 3600)
            minutes = remainder // 60

            # Calculate risk-reward ratio
            entry = Decimal(str(deal.price))
            sl = Decimal(str(deal.sl))
            tp = Decimal(str(deal.tp))
            
            risk = abs(entry - sl)
            reward = abs(tp - entry)
            rr_ratio = round(float(reward/risk), 1) if risk > 0 else 0

            trade_data = {
                'ticket': deal.ticket,
                'symbol': deal.symbol,
                'volume': deal.volume,
                'profit': deal.profit,
                'price': float(entry),
                'sl': float(sl),
                'tp': float(tp),
                'direction': 'BUY' if deal.entry == mt5.DEAL_ENTRY_IN else 'SELL',
                'duration': f"{int(hours)}h {int(minutes)}m",
                'rr_ratio': f"{rr_ratio}:1"
            }
            self.on_order_event('closed', trade_data)
        except Exception as e:
            logging.error(f"Deal processing error: {str(e)}")

    def start_monitoring(self):
        self.monitor_thread = threading.Thread(target=self.check_closed_positions)
        self.monitor_thread.daemon = True
        self.monitor_thread.start()

    def stop_monitoring(self):
        self.running = False
        self.monitor_thread.join()