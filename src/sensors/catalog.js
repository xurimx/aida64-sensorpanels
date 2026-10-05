/* SP.catalog: AIDA64 sensor IDs, shared by the sensor reference page and the designer.
   CATS      condensed rows from AIDA64's "Complete Sensor value list" (the reference page lists them)
   PATTERNS  numbered families the designer's sensor picker expands into concrete IDs
   FAMILIES  unit, typical range, decimals and simulation settings per ID pattern (first match wins) */
window.SP = window.SP || {};
SP.catalog = (() => {
  'use strict';
  /* [id, name, note?, flags?]  flags: g = condensed group */
  const CATS = [
    ['System', [
      ['SDATE', 'Date'], ['STIME', 'Time'], ['STIMENS', 'Time (HH:MM)'], ['SUPTIME', 'UpTime'], ['SUPTIMENS', 'UpTime (HH:MM)'],
      ['SCPUCLK', 'CPU Clock'], ['SCC-1-1–SCC-1-128', 'CPU #1 core clocks', 'One per core'], ['SCC-2-1–SCC-2-128', 'CPU #2 core clocks', 'Dual-socket systems'],
      ['SCPUMUL', 'CPU Multiplier'], ['SCPUFSB', 'CPU FSB'], ['SHTMUL', 'HyperTransport Multiplier'], ['SHTCLK', 'HyperTransport Clock'],
      ['SNBMUL', 'North Bridge Multiplier'], ['SNBCLK', 'North Bridge Clock'], ['SSAMUL', 'System Agent Multiplier'], ['SSACLK', 'System Agent Clock'],
      ['SMEMCLK', 'Memory Clock'], ['SMEMSPEED', 'Memory Speed'], ['SDRAMFSB', 'DRAM:FSB Ratio'], ['SMEMTIM', 'Memory Timings'],
      ['SMOBONAME', 'Motherboard Name'], ['SBIOSVER', 'BIOS Version'],
      ['SCPUUTI', 'CPU Utilization'], ['SCPU1UTI–SCPU128UTI', 'Per-thread utilization', 'One per logical CPU'], ['SCPUTHR', 'CPU Throttling'],
      ['SMEMUTI', 'Memory Utilization'], ['SUSEDMEM', 'Used Memory'], ['SFREEMEM', 'Free Memory'], ['SPROCESSES', 'Processes'], ['SUSERS', 'Users'],
      ['SDRVAUTI–SDRVZUTI', 'Drive A:–Z: Utilization', 'Percent of space used'], ['SDRVAUSEDSPC–SDRVZUSEDSPC', 'Drive A:–Z: Used Space'], ['SDRVAFREESPC–SDRVZFREESPC', 'Drive A:–Z: Free Space'],
      ['SSMASTA', 'SMART Status'], ['SDSK1ACT–SDSK25ACT', 'Disk 1–25 Activity'], ['SDSK1READSPD–SDSK25READSPD', 'Disk 1–25 Read Speed'], ['SDSK1WRITESPD–SDSK25WRITESPD', 'Disk 1–25 Write Speed'],
      ['SGPU1CLK', 'GPU1 Clock'], ['SGPU1SHDCLK', 'GPU1 Shader Clock'], ['SGPU1MEMCLK', 'GPU1 Memory Clock'], ['SGPU1UTI', 'GPU1 Utilization'],
      ['SGPU1MCUTI', 'GPU1 MC Utilization', 'Memory controller load'], ['SGPU1VEUTI', 'GPU1 VE Utilization', 'Video engine load'], ['SGPU1BIUTI', 'GPU1 BI Utilization', 'Bus interface load'],
      ['SGPU1USEDDEMEM', 'GPU1 Used Dedicated Memory'], ['SGPU1USEDDYMEM', 'GPU1 Used Dynamic Memory'], ['SGPU1BUSTYP', 'GPU1 Bus Type'],
      ['SGPU1PWRCTRL', 'GPU1 PowerControl'], ['SGPU1PERFCAP', 'GPU1 PerfCap Reason'],
      ['SVMEMUSAGE', 'Video Memory Utilization'], ['SUSEDVMEM', 'Used Video Memory'], ['SUSEDLVMEM', 'Used Local Video Memory'], ['SUSEDNLVMEM', 'Used Non-Local Video Memory'],
      ['SFREEVMEM', 'Free Video Memory'], ['SFREELVMEM', 'Free Local Video Memory'], ['SFREENLVMEM', 'Free Non-Local Video Memory'],
      ['SPRIIPADDR', 'Primary IP Address'], ['SEXTIPADDR', 'External IP Address', 'Keep it off a panel you screenshot or stream'],
      ['SNIC1DLRATE–SNIC8DLRATE', 'NIC1–NIC8 Download Rate'], ['SNIC1ULRATE–SNIC8ULRATE', 'NIC1–NIC8 Upload Rate'], ['SNIC1TOTDL–SNIC8TOTDL', 'NIC1–NIC8 Total Download'],
      ['SNIC1TOTUL–SNIC8TOTUL', 'NIC1–NIC8 Total Upload'], ['SNIC1CONNSPD–SNIC8CONNSPD', 'NIC1–NIC8 Connection Speed'], ['SNIC1WLANRSSI–SNIC8WLANRSSI', 'NIC1–NIC8 WLAN Signal Strength'],
      ['SDESKRES', 'Desktop Resolution'], ['SVREFRATE', 'Vertical Refresh Rate'], ['SDISPBRILVL', 'Display Brightness Level'], ['SMASTVOL', 'Master Volume'],
      ['SMEDTIT', 'Media Title'], ['SMEDSTA', 'Media Status'], ['SMEDPOS', 'Media Position'],
      ['SBATTLVL', 'Battery Level'], ['SBATTWEARLVL', 'Battery Wear Level'], ['SBATT', 'Battery'], ['SESTBATTTIME', 'Estimated Battery Time'], ['SPWRSTATE', 'Power State'], ['SBATTPWRLOADPERC', 'Battery Power Load'],
      ['SFRAPS', 'Fraps'], ['SRTSSFPS', 'RTSS FPS'],
      ['SJDDLRATE', 'JD Download Rate', 'JDownloader'], ['SJDTOTDL', 'JD Total Download'], ['SJDREMDL', 'JD Remaining Download'], ['SJDETA', 'JD ETA'],
      ['SREGVALS1–SREGVALS10', 'Registry Value Str1–Str10', 'Text you write to HKCU\\Software\\FinalWire\\AIDA64\\ImportValues'], ['SREGVALD1–SREGVALD10', 'Registry Value DW1–DW10', 'Numbers from the same key'],
    ]],
    ['Temperatures', [
      ['TMOBO', 'Motherboard'], ['TCPU', 'CPU'], ['TCPU1–TCPU4', 'CPU1–CPU4'], ['TCPUDIO', 'CPU Diode'], ['TCPUSOCK', 'CPU Socket'], ['TCPUPKG', 'CPU Package'],
      ['TCPU1PKG–TCPU4PKG', 'CPU1–CPU4 Package'], ['TCPUIAC', 'CPU IA Cores'], ['TCPUGTC', 'CPU GT Cores'], ['TCPUISP', 'CPU ISP'], ['TCPUSA', 'CPU System Agent'], ['TCPUTCTL', 'CPU Tctl', 'AMD'],
      ['TCC-1-1–TCC-1-128', 'CPU #1 core temperatures'], ['TCC-2-1–TCC-2-128', 'CPU #2 core temperatures'], ['TCCD1–TCCD12', 'CCD #1–#12', 'AMD chiplets'],
      ['TPPGACPU', 'PPGA CPU'], ['TS1CPU', 'Slot1 CPU'], ['TDIMM', 'DIMM'], ['TDIMM1–TDIMM4', 'DIMM1–DIMM4'], ['TDIMMTS1–TDIMMTS64', '1st–64th DIMM', 'DDR5 sticks report these'], ['TAMB1–TAMB32', '1st–32nd FB-DIMM'],
      ['TAGP', 'AGP'], ['TMPCI', 'MiniPCI'], ['TPCMCIA', 'PCMCIA'], ['TPCIE', 'PCI-E'], ['TPCIE1–TPCIE5', 'PCI-E #1–#5'],
      ['TUSB30', 'USB 3.0'], ['TUSB301–TUSB302', 'USB 3.0 #1–#2'], ['TUSB31', 'USB 3.1'], ['TSATA6G', 'SATA 6G'], ['TM2', 'M.2'], ['TM21–TM24', 'M.2 #1–#4', 'Motherboard M.2 slot sensors'], ['TMXM', 'MXM'],
      ['TSOC', 'SoC'], ['TVSOC', 'VSoC'], ['TCHIP', 'Chipset'], ['TNB', 'North Bridge'], ['TSB', 'South Bridge'], ['TPCH', 'PCH'], ['TPCHCORE', 'PCH Core'], ['TPCHDIO', 'PCH Diode'],
      ['TIMC', 'IMC'], ['TMCP', 'MCP'], ['TGMCH', 'GMCH'], ['TGMCH1–TGMCH2', 'GMCH1–GMCH2'], ['TPXH', 'PXH'], ['TPLX', 'PLX'],
      ['TPSU', 'Power Supply'], ['TPSU1–TPSU3', 'Power Supply #1–#3'], ['TAPS', 'APS'], ['TODD', 'Optical Drive'], ['TWLAN', 'WLAN'], ['TLCD', 'LCD'], ['TIGPU', 'iGPU'],
      ['TRAIDCTR', 'RAID Controller'], ['TRAIDCTR1–TRAIDCTR4', 'RAID Controller #1–#4'],
      ['TWATER', 'Water', 'Coolant temperature'], ['TWATER2–TWATER4', 'Water #2–#4'], ['TWATERIN', 'Water In'], ['TWATERIN2', 'Water In #2'], ['TWATEROUT', 'Water Out'], ['TWATEROUT2', 'Water Out #2'],
      ['TBATT', 'Battery'], ['TBATT2', 'Battery #2'], ['TPWM', 'PWM'], ['TPWM1–TPWM5', 'PWM1–PWM5'], ['TVRM', 'VRM'], ['TVRM1–TVRM3', 'VRM1–VRM3'], ['TMOS', 'MOS'], ['TMOS1–TMOS2', 'MOS1–MOS2'],
      ['TAUX', 'Aux'], ['TFRONT', 'Front'], ['TREAR', 'Rear'], ['TVCCIO', 'VCCIO'], ['TVCCSA', 'VCCSA'], ['TOPT1–TOPT3', 'OPT1–OPT3'], ['TSZS1–TSZS2', 'Subzero Sense #1–#2'], ['TEC1–TEC2', 'EC1–EC2'],
      ['TTSENSOR', 'T_Sensor', 'Motherboard thermistor header'], ['TTSENSOR1–TTSENSOR3', 'T_Sensor #1–#3'], ['TEXT1–TEXT3', 'Ext #1–#3'], ['TATX6P', 'ATX 6P'], ['TFAN1VRM–TFAN4VRM', 'Fan #1–#4 VRM'], ['TTEMP1–TTEMP99', 'Temperature #1–#99'],
      ['TGPU1', 'GPU1'], ['TGPU1GPU2', 'GPU1 #2'], ['TGPU1DIO', 'GPU1 Diode'], ['TGPU1DIOD', 'GPU1 Diode (DispIO)'], ['TGPU1DIOM', 'GPU1 Diode (MemIO)'], ['TGPU1DIOS', 'GPU1 Diode (Shader)'],
      ['TGPU1AMB', 'GPU1 Ambient'], ['TGPU1SOC', 'GPU1 SoC'], ['TGPU1HOT', 'GPU1 Hotspot'], ['TGPU1MEM', 'GPU1 Memory'], ['TGPU1MEM1–TGPU1MEM3', 'GPU1 Memory #1–#3'],
      ['TGPU1VRM', 'GPU1 VRM'], ['TGPU1VRM1–TGPU1VRM2', 'GPU1 VRM1–VRM2'], ['TGPU1PWM1–TGPU1PWM5', 'GPU1 PWM1–PWM5'],
      ['THDD1–THDD50', '1st–50th HDD', 'Also covers SSDs and NVMe'], ['THDD1TS2–THDD50TS2', '1st–50th HDD #2', 'Second sensor on drives that have one'],
    ]],
    ['Fans', [
      ['FCPU', 'CPU'], ['FCPU1–FCPU4', 'CPU1–CPU4'], ['FCPUOPT', 'CPU OPT'], ['FSYS', 'System'], ['FCHIP', 'Chipset'], ['FNB', 'North Bridge'], ['FSB', 'South Bridge'], ['FPCH', 'PCH'], ['FNFORCE', 'nForce'],
      ['FCHA', 'Chassis'], ['FCHA1–FCHA9', 'Chassis #1–#9'], ['FPSU', 'Power Supply'], ['FFRONT', 'Front'], ['FFRONT1–FFRONT5', 'Front #1–#5'], ['FREAR', 'Rear'], ['FREAR1–FREAR2', 'Rear #1–#2'],
      ['FOTES', 'OTES'], ['FOTES1–FOTES2', 'OTES1–OTES2'], ['FDIMM', 'DIMM'], ['FFBD', 'FBD'], ['FFBD1–FFBD2', 'FBD1–FBD2'], ['FM2', 'M.2'], ['FCOVER', 'Cover'], ['FHS', 'HS'], ['FHS1–FHS2', 'HS1–HS2'],
      ['FHDD', 'HDD'], ['FODD', 'ODD'], ['FMXM', 'MXM'], ['FPWM', 'PWM'], ['FVRM', 'VRM'], ['FMOS', 'MOS'], ['FMOS1–FMOS2', 'MOS1–MOS2'], ['FHAMP', 'HAMP'],
      ['FASSIST', 'Assistant'], ['FASSIST1–FASSIST3', 'Assistant #1–#3'], ['FAUX', 'Aux'], ['FAUX1–FAUX5', 'Aux1–Aux5'], ['FOPT1–FOPT5', 'OPT1–OPT5'], ['FFAN1–FFAN40', 'Fan #1–#40'],
      ['FWPUMP', 'Water Pump'], ['FWPUMP1–FWPUMP2', 'Water Pump #1–#2'], ['FWFLOW', 'Water Flow'], ['FWFLOW2', 'Water Flow #2'], ['FAIOPUMP', 'AIO Pump'], ['FPUMP1–FPUMP8', 'Pump #1–#8'],
      ['FGPU1–FGPU12', 'GPU1–GPU12'], ['FGPU1GPU2…', 'Extra fans per GPU', 'Cards with two or three fan channels', 'g'],
    ]],
    ['Fan duty', [
      ['DCPU', 'CPU', 'Fan speed in %'], ['DSYS', 'System'], ['DTBAL1–DTBAL4', 'T-Balancer #1–#4'], ['DGPU1–DGPU12', 'GPU1–GPU12'], ['DGPU1GPU2…', 'Extra fans per GPU', '', 'g'],
    ]],
    ['Voltage', [
      ['VCPU', 'CPU Core'], ['VCPU1–VCPU4', 'CPU1–CPU4 Core'], ['VCPUVID', 'CPU VID', 'Voltage the CPU asks for'], ['VCPUVRM…', 'CPU VRM rails', '', 'g'], ['VCPUAUX', 'CPU Aux'], ['VCPUVDDA', 'CPU VDDA'],
      ['V09V–V26V', 'Fixed rails +0.9 V to +2.6 V', '', 'g'], ['V33V', '+3.3 V'], ['VP5V', '+5 V'], ['VP5VBACK', '+5 V Backup'], ['VM5V', '−5 V'],
      ['VP12V', '+12 V', 'From the motherboard sensor'], ['VP12V1–VP12V5', '+12 V #1–#5'], ['VM12V', '−12 V'], ['V3VSB / V5VSB', 'Standby rails', '', 'g'], ['VBAT', 'VBAT Battery'],
      ['VDIMM', 'DIMM'], ['VDIMMAB / CD / EF / GH', 'DIMM channel pairs'], ['VDDRVPP…', 'DDR VPP rails', '', 'g'], ['VVCCIO', 'VCCIO'], ['VVCCIO2', 'VCCIO2'], ['VVCCSA', 'VCCSA'],
      ['VCPUNB… / VPCH… / VSB…', 'Chipset and PCH rails', '', 'g'], ['VFAN21–VFAN32', 'Fan voltages', '', 'g'], ['VPUMP1–VPUMP2', 'Pump voltages'],
      ['VGPU1', 'GPU1 Core'], ['VGPU1VCC', 'GPU1 Vcc'], ['VGPU1MEM', 'GPU1 Memory'], ['VGPU1MEMCORE', 'GPU1 Memory Core'], ['VGPU1MEMIO', 'GPU1 Memory I/O'], ['VGPU1SOC', 'GPU1 SoC'], ['VGPU1VRM', 'GPU1 VRM'],
      ['VGPU1P12V', 'GPU1 +12V'], ['VGPU1PCIE', 'GPU1 PCIe'], ['VGPU16P / 16P1 / 16P2', 'GPU1 6-pin'], ['VGPU18P / 18P1–18P3', 'GPU1 8-pin'], ['VGPU112VHPWR', 'GPU1 12VHPWR'],
    ]],
    ['Current', [
      ['CCPU', 'CPU'], ['CCPU1–CCPU4', 'CPU1–CPU4'], ['CCPUVDD…', 'CPU rail currents', '', 'g'], ['CVCCIO / CVCCSA', 'I/O and System Agent'], ['C15V–C33V', 'Fixed rail currents', '', 'g'],
      ['CP12V', '+12 V'], ['CP12V1–CP12V5', '+12 V #1–#5'], ['CDIMM… / CPCH', 'Memory and chipset', '', 'g'], ['CFAN21–CFAN32', 'Fan currents', '', 'g'], ['CPUMP1–CPUMP2', 'Pump currents'], ['CPSU…', 'Power supply and battery', '', 'g'],
      ['CGPU1MEM', 'GPU1 Memory'], ['CGPU1SOC', 'GPU1 SoC'], ['CGPU1VRM', 'GPU1 VRM'], ['CGPU1PCIE', 'GPU1 PCIe'], ['CGPU16P / 16P1 / 16P2', 'GPU1 6-pin'], ['CGPU18P / 18P1–18P3', 'GPU1 8-pin'], ['CGPU112VHPWR', 'GPU1 12VHPWR'],
    ]],
    ['Power', [
      ['PCPU', 'CPU'], ['PCPU1–PCPU2', 'CPU1–CPU2'], ['PCPUPKG', 'CPU Package'], ['PCPUIAC', 'CPU IA Cores'], ['PCPUGTC', 'CPU GT Cores', 'Integrated graphics'], ['PCPUCU0–PCPUCU1', 'CPU CU0–CU1'], ['PCPUUNC', 'CPU Uncore'],
      ['PCPUVDD', 'CPU VDD'], ['PCPUVDDNB', 'CPU VDDNB'], ['P15V', '+1.5 V'], ['P33V', '+3.3 V'], ['PP5V', '+5 V'], ['PP12V', '+12 V'], ['PP12V1–PP12V5', '+12 V #1–#5'],
      ['PDIMM', 'DIMM'], ['PIGPU', 'iGPU'], ['PFAN21–PFAN32', 'Fan power', '', 'g'], ['PPUMP1–PPUMP2', 'Pump power'], ['PPWR1–PPWR4', 'Power #1–#4'],
      ['PPSU', 'Power Supply', 'Digital PSUs only'], ['PBATT', 'Battery'], ['PBATTOUTP', 'Battery Output'], ['PBATTCHR', 'Battery Charge Rate'], ['PBATT2 / PBATT2OUTP / PBATT2CHR', 'Battery #2'],
      ['PGPU1', 'GPU1'], ['PGPU1TDPP', 'GPU1 TDP%'], ['PGPU1MEM', 'GPU1 Memory'], ['PGPU1SOC', 'GPU1 SoC'], ['PGPU1VRM', 'GPU1 VRM'], ['PGPU1PCIE', 'GPU1 PCIe', 'Power drawn through the slot'],
      ['PGPU16P / 16P1 / 16P2', 'GPU1 6-pin'], ['PGPU18P / 18P1–18P3', 'GPU1 8-pin'], ['PGPU112VHPWR', 'GPU1 12VHPWR'],
    ]],
    ['Flow & liquid', [
      ['WFLOW1–WFLOW20', 'Flow #1–#20', 'Custom loop flow meters'], ['LLIQ1–LLIQ4', 'Liquid #1–#4', 'Reservoir level sensors'],
    ]],
  ];

  /* [template, label, from, to]  {n} = number, {L} = drive letter, {o} = ordinal of n */
  const PATTERNS = [
    ['SCC-1-{n}', 'CPU #1 / Core #{n} Clock', 1, 32], ['TCC-1-{n}', 'CPU #1 / Core #{n}', 1, 32], ['SCPU{n}UTI', 'CPU{n} Utilization', 1, 64],
    ['TCPU{n}', 'CPU{n}', 1, 2], ['TCPU{n}PKG', 'CPU{n} Package', 1, 2], ['TCCD{n}', 'CCD #{n}', 1, 4],
    ['SDRV{L}UTI', 'Drive {L}: Utilization', 'C', 'Z'], ['SDRV{L}USEDSPC', 'Drive {L}: Used Space', 'C', 'Z'], ['SDRV{L}FREESPC', 'Drive {L}: Free Space', 'C', 'Z'],
    ['SDSK{n}ACT', 'Disk {n} Activity', 1, 8], ['SDSK{n}READSPD', 'Disk {n} Read Speed', 1, 8], ['SDSK{n}WRITESPD', 'Disk {n} Write Speed', 1, 8], ['THDD{n}', '{o} HDD', 1, 8],
    ['SNIC{n}DLRATE', 'NIC{n} Download Rate', 1, 8], ['SNIC{n}ULRATE', 'NIC{n} Upload Rate', 1, 8], ['SNIC{n}TOTDL', 'NIC{n} Total Download', 1, 8],
    ['SNIC{n}TOTUL', 'NIC{n} Total Upload', 1, 8], ['SNIC{n}CONNSPD', 'NIC{n} Connection Speed', 1, 8], ['SNIC{n}WLANRSSI', 'NIC{n} WLAN Signal Strength', 1, 8],
    ['TDIMMTS{n}', '{o} DIMM', 1, 8], ['TDIMM{n}', 'DIMM{n}', 1, 4], ['SREGVALS{n}', 'Registry Value Str{n}', 1, 10], ['SREGVALD{n}', 'Registry Value DW{n}', 1, 10],
    ['FCHA{n}', 'Chassis #{n}', 1, 9], ['FPUMP{n}', 'Pump #{n}', 1, 8], ['FFRONT{n}', 'Front #{n}', 1, 5], ['FOPT{n}', 'OPT{n}', 1, 5], ['FFAN{n}', 'Fan #{n}', 1, 12],
    ['TTSENSOR{n}', 'T_Sensor #{n}', 1, 3], ['TM2{n}', 'M.2 #{n}', 1, 4], ['TVRM{n}', 'VRM{n}', 1, 3], ['WFLOW{n}', 'Flow #{n}', 1, 4], ['LLIQ{n}', 'Liquid #{n}', 1, 4],
    ...[1, 2].flatMap(g => [
      [`SGPU${g}CLK`, `GPU${g} Clock`], [`SGPU${g}MEMCLK`, `GPU${g} Memory Clock`], [`SGPU${g}UTI`, `GPU${g} Utilization`], [`SGPU${g}MCUTI`, `GPU${g} MC Utilization`],
      [`SGPU${g}VEUTI`, `GPU${g} VE Utilization`], [`SGPU${g}USEDDEMEM`, `GPU${g} Used Dedicated Memory`], [`SGPU${g}PERFCAP`, `GPU${g} PerfCap Reason`],
      [`TGPU${g}`, `GPU${g}`], [`TGPU${g}DIO`, `GPU${g} Diode`], [`TGPU${g}HOT`, `GPU${g} Hotspot`], [`TGPU${g}MEM`, `GPU${g} Memory`], [`TGPU${g}VRM`, `GPU${g} VRM`],
      [`FGPU${g}`, `GPU${g}`], [`DGPU${g}`, `GPU${g}`], [`VGPU${g}`, `GPU${g} Core`], [`VGPU${g}MEM`, `GPU${g} Memory`], [`VGPU${g}12VHPWR`, `GPU${g} 12VHPWR`],
      [`PGPU${g}`, `GPU${g}`], [`PGPU${g}TDPP`, `GPU${g} TDP%`], [`PGPU${g}PCIE`, `GPU${g} PCIe`], [`PGPU${g}12VHPWR`, `GPU${g} 12VHPWR`],
    ].map(([t, l]) => [t, l, 0, 0])),
  ];

  /* unit '' = none. kind: num (default), text, date, time, uptime. sometimes: only reported while something runs */
  const F = (re, o) => [re, o];
  const FAMILIES = [
    F(/^SDATE$/, { kind: 'date' }), F(/^STIME(NS)?$/, { kind: 'time' }), F(/^SUPTIME(NS)?$/, { kind: 'uptime' }),
    F(/^SMEDTIT$/, { kind: 'text', sample: 'Midnight City', sometimes: true }), F(/^SMEDSTA$/, { kind: 'text', sample: 'Playing', sometimes: true }),
    F(/^SMEDPOS$/, { kind: 'text', sample: '2:41', sometimes: true }), F(/^SREGVALS\d+$/, { kind: 'text', sample: 'Your text', sometimes: true }),
    F(/^SREGVALD\d+$/, { lo: 0, hi: 100, mu: 42, sigma: 0, sometimes: true }),
    F(/^S(PRI|EXT)IPADDR$/, { kind: 'text', sample: '192.0.2.10' }), F(/^SGPU\d+PERFCAP$/, { kind: 'text', sample: 'Power' }),
    F(/^S(MOBONAME|BIOSVER|MEMTIM|SMASTA|DESKRES|PWRSTATE|BATT|ESTBATTTIME)$|^SGPU\d+(BUSTYP|PWRCTRL)$/, { kind: 'text', sample: '—' }),
    F(/^SJD/, { kind: 'text', sample: '—', sometimes: true }),
    F(/^S(RTSSFPS|FRAPS|AIDAFPS)$/, { unit: 'FPS', lo: 0, hi: 240, mu: 141, sigma: 5, sometimes: true }),
    F(/^SVREFRATE$/, { unit: 'Hz', lo: 0, hi: 240, mu: 165, sigma: 0 }),
    F(/^SCPUCLK$|^SCC-\d+-\d+$/, { unit: 'MHz', lo: 0, hi: 6000, mu: 4800, sigma: 40 }), F(/^S(CPU|HT|NB|SA)MUL$/, { unit: 'x', lo: 0, hi: 60, mu: 48, sigma: 0, dec: 1 }),
    F(/^S(CPU|HT|NB|SA|MEM)?(FSB|CLK)$/, { unit: 'MHz', lo: 0, hi: 5000, mu: 3000, sigma: 0 }), F(/^SMEMSPEED$/, { unit: 'MT/s', lo: 0, hi: 9000, mu: 6000, sigma: 0 }),
    F(/^SGPU\d+(SHD)?CLK$/, { unit: 'MHz', lo: 0, hi: 3200, mu: 2700, sigma: 15 }), F(/^SGPU\d+MEMCLK$/, { unit: 'MHz', lo: 0, hi: 12000, mu: 10500, sigma: 0 }),
    F(/^SCPUTHR$/, { unit: '%', lo: 0, hi: 100, mu: 0, sigma: 0 }), F(/^SDRV[A-Z]UTI$/, { unit: '%', lo: 0, hi: 100, mu: 55, sigma: 0 }),
    F(/UTI$/, { unit: '%', lo: 0, hi: 100, mu: 40, sigma: 6 }), F(/^SVMEMUSAGE$/, { unit: '%', lo: 0, hi: 100, mu: 60, sigma: .5 }),
    F(/^S(USED|FREE)(L|NL)?V?MEM$|^SGPU\d+USEDD[EY]MEM$/, { unit: 'MB', lo: 0, hi: 32768, mu: 12000, sigma: 50 }),
    F(/^SDRV[A-Z](USED|FREE)SPC$/, { unit: 'MB', lo: 0, hi: 2e6, mu: 6e5, sigma: 0 }), F(/^SDSK\d+ACT$/, { unit: '%', lo: 0, hi: 100, mu: 6, sigma: 3 }),
    F(/^SDSK\d+(READ|WRITE)SPD$/, { unit: 'MB/s', lo: 0, hi: 7000, mu: 40, sigma: 15, dec: 1 }),
    F(/^SNIC\d+(DL|UL)RATE$|^SJDDLRATE$/, { unit: 'KB/s', lo: 0, hi: 120000, mu: 1200, sigma: 500, dec: 1 }),
    F(/^SNIC\d+TOT(DL|UL)$/, { unit: 'MB', lo: 0, hi: 1e6, mu: 15320, sigma: 0 }), F(/^SNIC\d+CONNSPD$/, { unit: 'Mbps', lo: 0, hi: 10000, mu: 2500, sigma: 0 }),
    F(/^SNIC\d+WLANRSSI$/, { unit: '%', lo: 0, hi: 100, mu: 70, sigma: 1 }), F(/^S(DISPBRILVL|MASTVOL|BATTLVL|BATTWEARLVL|BATTPWRLOADPERC)$/, { unit: '%', lo: 0, hi: 100, mu: 60, sigma: 0 }),
    F(/^S(PROCESSES|USERS)$/, { unit: '', lo: 0, hi: 500, mu: 280, sigma: 2 }),
    F(/^TGPU\d+HOT/, { unit: '°C', lo: 20, hi: 110, mu: 79, sigma: .6 }), F(/^TGPU\d+MEM/, { unit: '°C', lo: 20, hi: 110, mu: 72, sigma: .5 }),
    F(/^TGPU/, { unit: '°C', lo: 20, hi: 100, mu: 66, sigma: .5 }), F(/^T(CPU|CC-|CCD)/, { unit: '°C', lo: 20, hi: 100, mu: 64, sigma: 1 }),
    F(/^THDD/, { unit: '°C', lo: 20, hi: 80, mu: 38, sigma: .2 }), F(/^T(DIMM|AMB)/, { unit: '°C', lo: 20, hi: 90, mu: 44, sigma: .2 }),
    F(/^TWATER/, { unit: '°C', lo: 20, hi: 50, mu: 33, sigma: .1, dec: 1 }), F(/^T/, { unit: '°C', lo: 20, hi: 100, mu: 45, sigma: .3 }),
    F(/^F(AIOPUMP|PUMP\d*|WPUMP\d*)$/, { unit: 'RPM', lo: 0, hi: 4500, mu: 2600, sigma: 12 }), F(/^FWFLOW/, { unit: 'L/h', lo: 0, hi: 300, mu: 120, sigma: 1 }),
    F(/^F/, { unit: 'RPM', lo: 0, hi: 3000, mu: 1100, sigma: 12 }), F(/^D/, { unit: '%', lo: 0, hi: 100, mu: 45, sigma: 1 }),
    F(/^V(P12V|GPU\d+(P12V|12VHPWR|PCIE|\d+P\d?))/, { unit: 'V', lo: 11, hi: 13, mu: 12.05, sigma: .01, dec: 3 }),
    F(/^V(P5V|5VSB)/, { unit: 'V', lo: 4.5, hi: 5.5, mu: 5.02, sigma: .005, dec: 3 }), F(/^V(33V|3VSB)/, { unit: 'V', lo: 3, hi: 3.6, mu: 3.31, sigma: .005, dec: 3 }),
    F(/^VM12V/, { unit: 'V', lo: -13, hi: -11, mu: -12.1, sigma: .01, dec: 3 }), F(/^VM5V/, { unit: 'V', lo: -5.5, hi: -4.5, mu: -5.05, sigma: .005, dec: 3 }),
    F(/^VBAT/, { unit: 'V', lo: 2.5, hi: 3.5, mu: 3.05, sigma: 0, dec: 3 }), F(/^V/, { unit: 'V', lo: 0, hi: 2, mu: 1.2, sigma: .01, dec: 3 }),
    F(/^C/, { unit: 'A', lo: 0, hi: 100, mu: 12, sigma: .4, dec: 2 }), F(/^PGPU\d+TDPP$/, { unit: '%', lo: 0, hi: 150, mu: 91, sigma: 2 }),
    F(/^PGPU/, { unit: 'W', lo: 0, hi: 450, mu: 318, sigma: 8, dec: 1 }), F(/^PCPU/, { unit: 'W', lo: 0, hi: 250, mu: 92, sigma: 4, dec: 1 }),
    F(/^P/, { unit: 'W', lo: 0, hi: 100, mu: 20, sigma: .5, dec: 1 }), F(/^WFLOW/, { unit: 'L/h', lo: 0, hi: 300, mu: 120, sigma: 1 }),
    F(/^LLIQ/, { unit: '%', lo: 0, hi: 100, mu: 80, sigma: 0 }),
  ];
  const CAT_OF = { S: 'System', T: 'Temperatures', F: 'Fans', D: 'Fan duty', V: 'Voltage', C: 'Current', P: 'Power', W: 'Flow & liquid', L: 'Flow & liquid' };
  const BASE = { kind: 'num', unit: '', lo: 0, hi: 100, mu: 50, sigma: 1, dec: 0, sometimes: false, sample: '' };

  /* defaults for a concrete sensor ID */
  function family(id) {
    id = String(id || '');
    const hit = FAMILIES.find(([re]) => re.test(id));
    return { ...BASE, ...(hit ? hit[1] : {}), cat: CAT_OF[id[0]] || 'Other' };
  }

  const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
  const fill = (s, v) => s.replace(/\{n\}/g, v).replace(/\{L\}/g, v).replace(/\{o\}/g, () => ordinal(+v));

  /* every concrete ID the generic picker offers, with a label: single rows from CATS plus expanded PATTERNS */
  let LIST = null;
  function list() {
    if (LIST) return LIST;
    const seen = new Map();
    for (const [cat, rows] of CATS) for (const [id, name, note = ''] of rows) if (/^[A-Z][A-Z0-9-]*$/.test(id)) seen.set(id, { id, label: name, note, cat });
    for (const [tpl, lab, from, to] of PATTERNS) {
      if (!from) { seen.set(tpl, { id: tpl, label: lab, note: '', cat: CAT_OF[tpl[0]] }); continue; }
      const vals = typeof from === 'string' ? Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) => String.fromCharCode(from.charCodeAt(0) + i))
        : Array.from({ length: to - from + 1 }, (_, i) => from + i);
      for (const v of vals) { const id = fill(tpl, v); if (!seen.has(id)) seen.set(id, { id, label: fill(lab, v), note: '', cat: CAT_OF[id[0]] }); }
    }
    return (LIST = [...seen.values()]);
  }
  /* best-known AIDA64 label for an ID (the real label comes from the PC's sensor list when there is one) */
  function label(id) {
    const hit = list().find(r => r.id === id);
    if (hit) return hit.label;
    for (const [tpl, lab] of PATTERNS) {
      const re = new RegExp('^' + tpl.replace(/[-]/g, '\\-').replace('{n}', '(\\d+)').replace('{L}', '([A-Z])') + '$');
      const m = id.match(re); if (m) return fill(lab, m[1]);
    }
    return id;
  }

  return { CATS, PATTERNS, FAMILIES, family, list, label, ordinal };
})();
