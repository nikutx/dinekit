<?php
/**
 * Minimal, dependency-free QR Code encoder (byte mode, ECC level M,
 * versions 1–10 — ample for a menu URL). Pure PHP, no external API, no GD
 * required for the SVG output.
 *
 * Implements: byte-mode data encoding, Reed–Solomon error correction over
 * GF(256), function-pattern placement, data masking with penalty scoring, and
 * format/version information. Output is a module matrix rendered to SVG.
 *
 * @package DineKit
 */

namespace DineKit\QR;

// Direct access guard.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Per-version data (ECC level M): total data codewords, EC codewords per block,
 * and block layout [ [count, data_per_block], ... ].
 *
 * @return array<int,array{data:int,ec:int,blocks:array<int,array{0:int,1:int}>}>
 */
function version_table() {
	return array(
		1  => array( 'data' => 16, 'ec' => 10, 'blocks' => array( array( 1, 16 ) ) ),
		2  => array( 'data' => 28, 'ec' => 16, 'blocks' => array( array( 1, 28 ) ) ),
		3  => array( 'data' => 44, 'ec' => 26, 'blocks' => array( array( 1, 44 ) ) ),
		4  => array( 'data' => 64, 'ec' => 18, 'blocks' => array( array( 2, 32 ) ) ),
		5  => array( 'data' => 86, 'ec' => 24, 'blocks' => array( array( 2, 43 ) ) ),
		6  => array( 'data' => 108, 'ec' => 16, 'blocks' => array( array( 4, 27 ) ) ),
		7  => array( 'data' => 124, 'ec' => 18, 'blocks' => array( array( 4, 31 ) ) ),
		8  => array( 'data' => 154, 'ec' => 22, 'blocks' => array( array( 2, 38 ), array( 2, 39 ) ) ),
		9  => array( 'data' => 182, 'ec' => 22, 'blocks' => array( array( 3, 36 ), array( 2, 37 ) ) ),
		10 => array( 'data' => 216, 'ec' => 26, 'blocks' => array( array( 4, 43 ), array( 1, 44 ) ) ),
	);
}

/**
 * Alignment pattern centre coordinates per version.
 *
 * @return array<int,array<int,int>>
 */
function alignment_positions() {
	return array(
		1  => array(),
		2  => array( 6, 18 ),
		3  => array( 6, 22 ),
		4  => array( 6, 26 ),
		5  => array( 6, 30 ),
		6  => array( 6, 34 ),
		7  => array( 6, 22, 38 ),
		8  => array( 6, 24, 42 ),
		9  => array( 6, 26, 46 ),
		10 => array( 6, 28, 50 ),
	);
}

/**
 * GF(256) exp/log tables (primitive polynomial 0x11d).
 *
 * @return array{exp:array<int,int>,log:array<int,int>}
 */
function gf_tables() {
	static $tables = null;
	if ( null !== $tables ) {
		return $tables;
	}
	$exp = array_fill( 0, 512, 0 );
	$log = array_fill( 0, 256, 0 );
	$x   = 1;
	for ( $i = 0; $i < 255; $i++ ) {
		$exp[ $i ] = $x;
		$log[ $x ] = $i;
		$x       <<= 1;
		if ( $x & 0x100 ) {
			$x ^= 0x11d;
		}
	}
	for ( $i = 255; $i < 512; $i++ ) {
		$exp[ $i ] = $exp[ $i - 255 ];
	}
	$tables = array(
		'exp' => $exp,
		'log' => $log,
	);
	return $tables;
}

/**
 * Reed–Solomon error correction codewords for a data block.
 *
 * @param array<int,int> $data Data codewords.
 * @param int            $ec   Number of EC codewords.
 * @return array<int,int>
 */
function rs_encode( $data, $ec ) {
	$t   = gf_tables();
	$exp = $t['exp'];
	$log = $t['log'];

	// Generator polynomial.
	$gen = array( 1 );
	for ( $i = 0; $i < $ec; $i++ ) {
		$next = array_fill( 0, count( $gen ) + 1, 0 );
		foreach ( $gen as $j => $coef ) {
			$next[ $j ]       ^= $coef;
			$next[ $j + 1 ]  ^= ( 0 === $coef ) ? 0 : $exp[ ( $log[ $coef ] + $i ) % 255 ];
		}
		$gen = $next;
	}

	$rem = array_merge( $data, array_fill( 0, $ec, 0 ) );
	$len = count( $data );
	for ( $i = 0; $i < $len; $i++ ) {
		$factor = $rem[ $i ];
		if ( 0 === $factor ) {
			continue;
		}
		$lf = $log[ $factor ];
		foreach ( $gen as $j => $coef ) {
			$rem[ $i + $j ] ^= $exp[ ( $log[ $coef ] + $lf ) % 255 ];
		}
	}
	return array_slice( $rem, $len, $ec );
}

/**
 * Choose the smallest version that fits the byte payload.
 *
 * @param int $bytes Payload length in bytes.
 * @return int|null Version, or null if too large.
 */
function pick_version( $bytes ) {
	foreach ( version_table() as $version => $info ) {
		$count_bits  = $version >= 10 ? 16 : 8;
		$capacity    = (int) floor( ( $info['data'] * 8 - 4 - $count_bits ) / 8 );
		if ( $bytes <= $capacity ) {
			return $version;
		}
	}
	return null;
}

/**
 * Encode a string to a QR module matrix (true = dark).
 *
 * @param string $text Payload (typically a URL).
 * @return array<int,array<int,bool>>|null Matrix, or null if too large.
 */
function encode( $text ) {
	$bytes   = array_values( unpack( 'C*', $text ) );
	$len     = count( $bytes );
	$version = pick_version( $len );
	if ( null === $version ) {
		return null;
	}

	$info       = version_table()[ $version ];
	$count_bits = $version >= 10 ? 16 : 8;

	// --- Bit stream ---
	$bits = '';
	$bits .= '0100'; // Byte mode.
	$bits .= str_pad( decbin( $len ), $count_bits, '0', STR_PAD_LEFT );
	foreach ( $bytes as $b ) {
		$bits .= str_pad( decbin( $b ), 8, '0', STR_PAD_LEFT );
	}
	$capacity_bits = $info['data'] * 8;
	// Terminator (up to 4 zero bits).
	$bits .= str_repeat( '0', min( 4, $capacity_bits - strlen( $bits ) ) );
	// Pad to a byte boundary.
	if ( strlen( $bits ) % 8 !== 0 ) {
		$bits .= str_repeat( '0', 8 - ( strlen( $bits ) % 8 ) );
	}
	// Pad bytes 0xEC / 0x11.
	$pads = array( 0xEC, 0x11 );
	$pi   = 0;
	while ( strlen( $bits ) < $capacity_bits ) {
		$bits .= str_pad( decbin( $pads[ $pi % 2 ] ), 8, '0', STR_PAD_LEFT );
		++$pi;
	}

	// Data codewords.
	$data_cw = array();
	for ( $i = 0; $i < strlen( $bits ); $i += 8 ) {
		$data_cw[] = bindec( substr( $bits, $i, 8 ) );
	}

	// --- Split into blocks, compute EC ---
	$blocks    = array();
	$ec_blocks = array();
	$pos       = 0;
	foreach ( $info['blocks'] as $group ) {
		list( $num, $per ) = $group;
		for ( $b = 0; $b < $num; $b++ ) {
			$block       = array_slice( $data_cw, $pos, $per );
			$pos        += $per;
			$blocks[]    = $block;
			$ec_blocks[] = rs_encode( $block, $info['ec'] );
		}
	}

	// Interleave data codewords.
	$final    = array();
	$max_data = 0;
	foreach ( $blocks as $block ) {
		$max_data = max( $max_data, count( $block ) );
	}
	for ( $i = 0; $i < $max_data; $i++ ) {
		foreach ( $blocks as $block ) {
			if ( isset( $block[ $i ] ) ) {
				$final[] = $block[ $i ];
			}
		}
	}
	// Interleave EC codewords.
	for ( $i = 0; $i < $info['ec']; $i++ ) {
		foreach ( $ec_blocks as $block ) {
			$final[] = $block[ $i ];
		}
	}

	// Final bit string.
	$final_bits = '';
	foreach ( $final as $cw ) {
		$final_bits .= str_pad( decbin( $cw ), 8, '0', STR_PAD_LEFT );
	}

	return build_matrix( $version, $final_bits );
}

/**
 * Place patterns + data and apply the best mask.
 *
 * @param int    $version Version.
 * @param string $bits    Final interleaved bit string.
 * @return array<int,array<int,bool>>
 */
function build_matrix( $version, $bits ) {
	$size     = $version * 4 + 17;
	$matrix   = array();
	$reserved = array();
	for ( $r = 0; $r < $size; $r++ ) {
		$matrix[ $r ]   = array_fill( 0, $size, false );
		$reserved[ $r ] = array_fill( 0, $size, false );
	}

	$set = function ( $r, $c, $val ) use ( &$matrix, &$reserved ) {
		$matrix[ $r ][ $c ]   = (bool) $val;
		$reserved[ $r ][ $c ] = true;
	};

	// Finder patterns + separators at three corners.
	$finder = function ( $row, $col ) use ( $set, $size ) {
		for ( $r = -1; $r <= 7; $r++ ) {
			for ( $c = -1; $c <= 7; $c++ ) {
				$rr = $row + $r;
				$cc = $col + $c;
				if ( $rr < 0 || $rr >= $size || $cc < 0 || $cc >= $size ) {
					continue;
				}
				$in_ring = ( 0 <= $r && $r <= 6 && ( 0 === $c || 6 === $c ) )
					|| ( 0 <= $c && $c <= 6 && ( 0 === $r || 6 === $r ) );
				$in_core = ( 2 <= $r && $r <= 4 && 2 <= $c && $c <= 4 );
				$set( $rr, $cc, $in_ring || $in_core );
			}
		}
	};
	$finder( 0, 0 );
	$finder( 0, $size - 7 );
	$finder( $size - 7, 0 );

	// Timing patterns.
	for ( $i = 8; $i < $size - 8; $i++ ) {
		$set( 6, $i, 0 === $i % 2 );
		$set( $i, 6, 0 === $i % 2 );
	}

	// Alignment patterns.
	$centers = alignment_positions()[ $version ];
	foreach ( $centers as $ar ) {
		foreach ( $centers as $ac ) {
			// Skip the ones overlapping finders.
			if ( ( 6 === $ar && 6 === $ac ) || ( 6 === $ar && $ac === $size - 7 ) || ( $ar === $size - 7 && 6 === $ac ) ) {
				continue;
			}
			for ( $r = -2; $r <= 2; $r++ ) {
				for ( $c = -2; $c <= 2; $c++ ) {
					$ring = ( -2 === $r || 2 === $r || -2 === $c || 2 === $c || ( 0 === $r && 0 === $c ) );
					$set( $ar + $r, $ac + $c, $ring );
				}
			}
		}
	}

	// Dark module.
	$set( $size - 8, 8, 1 );

	// Reserve format-info areas.
	for ( $i = 0; $i < 9; $i++ ) {
		if ( ! $reserved[8][ $i ] ) {
			$reserved[8][ $i ] = true;
		}
		if ( ! $reserved[ $i ][8] ) {
			$reserved[ $i ][8] = true;
		}
	}
	for ( $i = 0; $i < 8; $i++ ) {
		$reserved[8][ $size - 1 - $i ] = true;
		$reserved[ $size - 1 - $i ][8] = true;
	}

	// Reserve version-info areas (v >= 7).
	if ( $version >= 7 ) {
		for ( $i = 0; $i < 6; $i++ ) {
			for ( $j = 0; $j < 3; $j++ ) {
				$reserved[ $i ][ $size - 11 + $j ] = true;
				$reserved[ $size - 11 + $j ][ $i ] = true;
			}
		}
	}

	// --- Place data bits (zigzag) ---
	$bit_len = strlen( $bits );
	$idx     = 0;
	$col     = $size - 1;
	$upward  = true;
	while ( $col > 0 ) {
		if ( 6 === $col ) {
			--$col; // Skip vertical timing column.
		}
		for ( $i = 0; $i < $size; $i++ ) {
			$row = $upward ? $size - 1 - $i : $i;
			for ( $k = 0; $k < 2; $k++ ) {
				$c = $col - $k;
				if ( $reserved[ $row ][ $c ] ) {
					continue;
				}
				$bit                = ( $idx < $bit_len ) ? ( '1' === $bits[ $idx ] ) : false;
				$matrix[ $row ][ $c ] = $bit;
				++$idx;
			}
		}
		$col   -= 2;
		$upward = ! $upward;
	}

	// --- Choose best mask ---
	$best_mask   = 0;
	$best_score  = PHP_INT_MAX;
	$best_matrix = null;
	for ( $mask = 0; $mask < 8; $mask++ ) {
		$candidate = apply_mask( $matrix, $reserved, $mask, $size );
		place_format( $candidate, $mask, $size );
		if ( $version >= 7 ) {
			place_version( $candidate, $version, $size );
		}
		$score = penalty( $candidate, $size );
		if ( $score < $best_score ) {
			$best_score  = $score;
			$best_mask   = $mask;
			$best_matrix = $candidate;
		}
	}

	return $best_matrix;
}

/**
 * Apply a mask to the non-reserved modules.
 *
 * @param array<int,array<int,bool>> $matrix   Base matrix.
 * @param array<int,array<int,bool>> $reserved Reserved map.
 * @param int                        $mask     Mask id 0–7.
 * @param int                        $size     Matrix size.
 * @return array<int,array<int,bool>>
 */
function apply_mask( $matrix, $reserved, $mask, $size ) {
	$out = $matrix;
	for ( $r = 0; $r < $size; $r++ ) {
		for ( $c = 0; $c < $size; $c++ ) {
			if ( $reserved[ $r ][ $c ] ) {
				continue;
			}
			$flip = false;
			switch ( $mask ) {
				case 0:
					$flip = 0 === ( ( $r + $c ) % 2 );
					break;
				case 1:
					$flip = 0 === ( $r % 2 );
					break;
				case 2:
					$flip = 0 === ( $c % 3 );
					break;
				case 3:
					$flip = 0 === ( ( $r + $c ) % 3 );
					break;
				case 4:
					$flip = 0 === ( ( intdiv( $r, 2 ) + intdiv( $c, 3 ) ) % 2 );
					break;
				case 5:
					$flip = 0 === ( ( ( $r * $c ) % 2 ) + ( ( $r * $c ) % 3 ) );
					break;
				case 6:
					$flip = 0 === ( ( ( ( $r * $c ) % 2 ) + ( ( $r * $c ) % 3 ) ) % 2 );
					break;
				case 7:
					$flip = 0 === ( ( ( ( $r + $c ) % 2 ) + ( ( $r * $c ) % 3 ) ) % 2 );
					break;
			}
			if ( $flip ) {
				$out[ $r ][ $c ] = ! $out[ $r ][ $c ];
			}
		}
	}
	return $out;
}

/**
 * Write the format information (ECC level M) for a mask.
 *
 * @param array<int,array<int,bool>> $matrix Matrix (by reference).
 * @param int                        $mask   Mask id.
 * @param int                        $size   Size.
 * @return void
 */
function place_format( &$matrix, $mask, $size ) {
	$data = ( 0b00 << 3 ) | $mask; // ECC level M = 00.
	$rem  = $data;
	for ( $i = 0; $i < 10; $i++ ) {
		$rem = ( $rem << 1 ) ^ ( ( ( $rem >> 9 ) & 1 ) ? 0b10100110111 : 0 );
	}
	$format = ( ( $data << 10 ) | $rem ) ^ 0b101010000010010;

	$bits = array();
	for ( $i = 14; $i >= 0; $i-- ) {
		$bits[] = ( $format >> $i ) & 1;
	}

	// Around top-left finder.
	$coords1 = array(
		array( 8, 0 ), array( 8, 1 ), array( 8, 2 ), array( 8, 3 ), array( 8, 4 ), array( 8, 5 ),
		array( 8, 7 ), array( 8, 8 ), array( 7, 8 ), array( 5, 8 ), array( 4, 8 ), array( 3, 8 ),
		array( 2, 8 ), array( 1, 8 ), array( 0, 8 ),
	);
	foreach ( $coords1 as $i => $rc ) {
		$matrix[ $rc[0] ][ $rc[1] ] = (bool) $bits[ $i ];
	}

	// Split across the other two finders.
	$coords2 = array();
	for ( $i = 0; $i < 8; $i++ ) {
		$coords2[] = array( 8, $size - 1 - $i );
	}
	for ( $i = 9; $i < 15; $i++ ) {
		$coords2[] = array( $size - 15 + $i, 8 );
	}
	foreach ( $coords2 as $i => $rc ) {
		$matrix[ $rc[0] ][ $rc[1] ] = (bool) $bits[ $i ];
	}
}

/**
 * Write the version information (v >= 7).
 *
 * @param array<int,array<int,bool>> $matrix  Matrix (by reference).
 * @param int                        $version Version.
 * @param int                        $size    Size.
 * @return void
 */
function place_version( &$matrix, $version, $size ) {
	$rem = $version;
	for ( $i = 0; $i < 12; $i++ ) {
		$rem = ( $rem << 1 ) ^ ( ( ( $rem >> 11 ) & 1 ) ? 0b1111100100101 : 0 );
	}
	$vinfo = ( $version << 12 ) | $rem;

	for ( $i = 0; $i < 18; $i++ ) {
		$bit = ( $vinfo >> $i ) & 1;
		$r   = intdiv( $i, 3 );
		$c   = $i % 3;
		$matrix[ $r ][ $size - 11 + $c ] = (bool) $bit;
		$matrix[ $size - 11 + $c ][ $r ] = (bool) $bit;
	}
}

/**
 * Compute the mask penalty score (four standard rules).
 *
 * @param array<int,array<int,bool>> $m    Matrix.
 * @param int                        $size Size.
 * @return int
 */
function penalty( $m, $size ) {
	$score = 0;

	// Rule 1: runs of 5+ same-colour in rows and columns.
	for ( $r = 0; $r < $size; $r++ ) {
		$run_c = 1;
		$run_v = 1;
		for ( $c = 1; $c < $size; $c++ ) {
			$run_c = ( $m[ $r ][ $c ] === $m[ $r ][ $c - 1 ] ) ? $run_c + 1 : 1;
			if ( 5 === $run_c ) {
				$score += 3;
			} elseif ( $run_c > 5 ) {
				++$score;
			}
			$run_v = ( $m[ $c ][ $r ] === $m[ $c - 1 ][ $r ] ) ? $run_v + 1 : 1;
			if ( 5 === $run_v ) {
				$score += 3;
			} elseif ( $run_v > 5 ) {
				++$score;
			}
		}
	}

	// Rule 2: 2x2 blocks of the same colour.
	for ( $r = 0; $r < $size - 1; $r++ ) {
		for ( $c = 0; $c < $size - 1; $c++ ) {
			$v = $m[ $r ][ $c ];
			if ( $v === $m[ $r ][ $c + 1 ] && $v === $m[ $r + 1 ][ $c ] && $v === $m[ $r + 1 ][ $c + 1 ] ) {
				$score += 3;
			}
		}
	}

	// Rule 3: finder-like 1:1:3:1:1 patterns.
	$pattern1 = array( true, false, true, true, true, false, true, false, false, false, false );
	$pattern2 = array( false, false, false, false, true, false, true, true, true, false, true );
	for ( $r = 0; $r < $size; $r++ ) {
		for ( $c = 0; $c <= $size - 11; $c++ ) {
			$match1 = true;
			$match2 = true;
			for ( $k = 0; $k < 11; $k++ ) {
				if ( $m[ $r ][ $c + $k ] !== $pattern1[ $k ] ) {
					$match1 = false;
				}
				if ( $m[ $r ][ $c + $k ] !== $pattern2[ $k ] ) {
					$match2 = false;
				}
			}
			if ( $match1 || $match2 ) {
				$score += 40;
			}
		}
	}
	for ( $c = 0; $c < $size; $c++ ) {
		for ( $r = 0; $r <= $size - 11; $r++ ) {
			$match1 = true;
			$match2 = true;
			for ( $k = 0; $k < 11; $k++ ) {
				if ( $m[ $r + $k ][ $c ] !== $pattern1[ $k ] ) {
					$match1 = false;
				}
				if ( $m[ $r + $k ][ $c ] !== $pattern2[ $k ] ) {
					$match2 = false;
				}
			}
			if ( $match1 || $match2 ) {
				$score += 40;
			}
		}
	}

	// Rule 4: dark/light balance.
	$dark = 0;
	for ( $r = 0; $r < $size; $r++ ) {
		foreach ( $m[ $r ] as $cell ) {
			if ( $cell ) {
				++$dark;
			}
		}
	}
	$total   = $size * $size;
	$percent = ( $dark * 100 ) / $total;
	$score  += ( (int) ( abs( $percent - 50 ) / 5 ) ) * 10;

	return $score;
}

/**
 * Render a module matrix to an SVG string.
 *
 * @param array<int,array<int,bool>> $matrix Matrix.
 * @param int                        $scale  Module size in px.
 * @param int                        $quiet  Quiet-zone modules.
 * @return string
 */
function to_svg( $matrix, $scale = 10, $quiet = 4 ) {
	$size  = count( $matrix );
	$dim   = ( $size + 2 * $quiet ) * $scale;
	$rects = '';
	for ( $r = 0; $r < $size; $r++ ) {
		for ( $c = 0; $c < $size; $c++ ) {
			if ( $matrix[ $r ][ $c ] ) {
				$x      = ( $c + $quiet ) * $scale;
				$y      = ( $r + $quiet ) * $scale;
				$rects .= '<rect x="' . $x . '" y="' . $y . '" width="' . $scale . '" height="' . $scale . '"/>';
			}
		}
	}
	return '<svg xmlns="http://www.w3.org/2000/svg" width="' . $dim . '" height="' . $dim . '" viewBox="0 0 ' . $dim . ' ' . $dim . '" shape-rendering="crispEdges">' .
		'<rect width="' . $dim . '" height="' . $dim . '" fill="#ffffff"/>' .
		'<g fill="#000000">' . $rects . '</g></svg>';
}
