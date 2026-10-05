"""Write synthetic AIDA64 sensor-list fixtures for the designer tests (src/designer/check_designer.py).

They imitate the owner's PC (Intel 6 P + 8 E cores / 20 threads, one GPU, disks 1-2 on C: and D:, NIC6 carrying
the traffic, DIMM slots 2 and 4, an AIO) in the three formats the designer accepts:
  owner.reg            reg export   (UTF-16LE with BOM)
  owner.regquery.txt   reg query    (what `reg query … | clip` puts on the clipboard)
  owner.sharedmem.txt  shared memory (AIDA64_SensorValues XML records, no root element)
SYNTHETIC: replace with a real export from the owner's PC when available (strip the IP values first).

Run:  uv run python src/designer/fixtures/make_fixtures.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = r'HKEY_CURRENT_USER\Software\FinalWire\AIDA64\SensorValues'


def sensors():
    S = []  # (xml tag, id, label, value)
    add = lambda tag, i, l, v: S.append((tag, i, l, str(v)))
    for i, l, v in [('SDATE', 'Date', '5.10.2026'), ('STIME', 'Time', '22:41:07'), ('SUPTIME', 'UpTime', '3:12:44'), ('SCPUCLK', 'CPU Clock', 5100),
                    ('SCPUMUL', 'CPU Multiplier', '51.00'), ('SCPUUTI', 'CPU Utilization', 34), ('SCPUTHR', 'CPU Throttling', 0), ('SMEMUTI', 'Memory Utilization', 49),
                    ('SUSEDMEM', 'Used Memory', 16056), ('SFREEMEM', 'Free Memory', 16712), ('SGPU1CLK', 'GPU1 Clock', 2745), ('SGPU1MEMCLK', 'GPU1 Memory Clock', 10501),
                    ('SGPU1UTI', 'GPU1 Utilization', 97), ('SGPU1PERFCAP', 'GPU1 PerfCap Reason', 'Power'), ('SVMEMUSAGE', 'Video Memory Utilization', 71),
                    ('SUSEDVMEM', 'Used Video Memory', 11633), ('SFREEVMEM', 'Free Video Memory', 4751), ('SVREFRATE', 'Vertical Refresh Rate', 165),
                    ('SPRIIPADDR', 'Primary IP Address', '192.168.1.20'), ('SEXTIPADDR', 'External IP Address', '203.0.113.7'),
                    ('SDRVCUTI', 'Drive C: Utilization', 63), ('SDRVDUTI', 'Drive D: Utilization', 41)]:
        add('sys', i, l, v)
    for n in range(1, 15):
        add('sys', f'SCC-1-{n}', f'CPU #1 / Core #{n} Clock', 5100 if n <= 6 else 3900)
    for t in range(1, 21):
        add('sys', f'SCPU{t}UTI', f'CPU{t} Utilization', 30 + t % 7)
    for d in (1, 2):
        add('sys', f'SDSK{d}ACT', f'Disk {d} Activity', 9 if d == 1 else 2)
        add('sys', f'SDSK{d}READSPD', f'Disk {d} Read Speed', '85.3')
        add('sys', f'SDSK{d}WRITESPD', f'Disk {d} Write Speed', '6.1')
    for n in range(1, 7):
        busy = n == 6
        add('sys', f'SNIC{n}DLRATE', f'NIC{n} Download Rate', '2400.5' if busy else '0.0')
        add('sys', f'SNIC{n}ULRATE', f'NIC{n} Upload Rate', '180.2' if busy else '0.0')
        add('sys', f'SNIC{n}TOTDL', f'NIC{n} Total Download', 15320 if busy else 0)
        add('sys', f'SNIC{n}TOTUL', f'NIC{n} Total Upload', 1240 if busy else 0)
    add('sys', 'SNIC6CONNSPD', 'NIC6 Connection Speed', 2500)
    for i, l, v in [('TMOBO', 'Motherboard', 38), ('TCPU', 'CPU', 66), ('TCPUPKG', 'CPU Package', 67), ('TCPUIAC', 'CPU IA Cores', 66), ('TPCH', 'PCH', 50),
                    ('TVRM', 'VRM', 52), ('TWATER', 'Water', '33.4'), ('TDIMMTS2', '2nd DIMM', 44), ('TDIMMTS4', '4th DIMM', 45), ('TGPU1', 'GPU1', 66),
                    ('TGPU1DIO', 'GPU1 Diode', 66), ('TGPU1HOT', 'GPU1 Hotspot', 79), ('TGPU1MEM', 'GPU1 Memory', 72),
                    ('THDD1', 'Samsung SSD 990 PRO 2TB', 41), ('THDD2', 'WD_BLACK SN850X 4000GB', 37)]:
        add('temp', i, l, v)
    for n in range(1, 15):
        add('temp', f'TCC-1-{n}', f'CPU #1 / Core #{n}', 64 + n % 4)
    for i, l, v in [('FCPU', 'CPU', 1210), ('FAIOPUMP', 'AIO Pump', 2620), ('FCHA1', 'Chassis #1', 980), ('FCHA2', 'Chassis #2', 960), ('FCHA3', 'Chassis #3', 1000),
                    ('FCHA4', 'Chassis #4', 0), ('FGPU1', 'GPU1', 1650)]:
        add('fan', i, l, v)
    add('duty', 'DGPU1', 'GPU1', 45)
    for i, l, v in [('VCPU', 'CPU Core', '1.245'), ('VP12V', '+12 V', '12.048'), ('VGPU1', 'GPU1 Core', '1.050'), ('VGPU112VHPWR', 'GPU1 12VHPWR', '11.98')]:
        add('volt', i, l, v)
    for i, l, v in [('PCPUPKG', 'CPU Package', '92.41'), ('PCPUIAC', 'CPU IA Cores', '78.12'), ('PGPU1', 'GPU1', '318.40'), ('PGPU1TDPP', 'GPU1 TDP%', 91),
                    ('PGPU112VHPWR', 'GPU1 12VHPWR', '292.88')]:
        add('pwr', i, l, v)
    return S


def main():
    S = sensors()
    reg = ['Windows Registry Editor Version 5.00', '', f'[{KEY}]']
    esc = lambda s: s.replace('\\', '\\\\').replace('"', '\\"')
    for _, i, l, v in S:
        reg += [f'"Label.{i}"="{esc(l)}"', f'"Value.{i}"="{esc(v)}"']
    with open(os.path.join(HERE, 'owner.reg'), 'wb') as fh:
        fh.write(b'\xff\xfe' + ('\r\n'.join(reg) + '\r\n\r\n').encode('utf-16-le'))
    q = ['', KEY]
    for _, i, l, v in S:
        q += [f'    Label.{i}    REG_SZ    {l}', f'    Value.{i}    REG_SZ    {v}']
    with open(os.path.join(HERE, 'owner.regquery.txt'), 'w', encoding='utf-8', newline='\r\n') as fh:
        fh.write('\n'.join(q) + '\n\n')
    xml = ''.join(f'<{t}><id>{i}</id><label>{l}</label><value>{v}</value></{t}>' for t, i, l, v in S)
    with open(os.path.join(HERE, 'owner.sharedmem.txt'), 'w', encoding='cp1252', newline='') as fh:
        fh.write(xml)
    print(len(S), 'sensors written')


if __name__ == '__main__':
    main()
